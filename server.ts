// bb-plugin-better-sidebar — backend entry.
//
// This file is wiring: settings, the rpc surface, one cron sweep, and a `bb
// better-sidebar` command. The rules live in src/, where they are testable
// without a bb server.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { ICONS_CHANNEL } from "./src/channels";
import {
  rpcContract,
  type FeatureFlags,
  type ProjectOrderEntry,
} from "./src/contract";
import { IconService, type IconServiceProject } from "./src/icon-service";
import {
  readPreferences,
  writePreferences,
  type Preferences,
} from "./src/preferences";
import { projectNameFromPath } from "./src/project-name";
import { resolveProjectMove } from "./src/reorder";
import type { FetchLike } from "./src/resolve-icon";
import { runCli } from "./src/cli";

export { rpcContract };

/** Nightly, off-peak: an account avatar changes rarely and never urgently. */
const SWEEP_CRON = "17 4 * * *";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    projectIcons: {
      type: "boolean",
      label: "Project icons in the sidebar",
      default: true,
    },
    tabFavicon: {
      type: "boolean",
      label: "Use the project icon as the browser tab favicon",
      default: true,
    },
    showBranch: {
      type: "boolean",
      label: "Show each thread's branch or machine",
      default: true,
    },
    showPullRequests: {
      type: "boolean",
      label: "Show pull request status on threads (extra git host lookups)",
      default: false,
    },
  });

  const features = async (): Promise<FeatureFlags> => {
    // Read per call rather than once at load: a settings save does not reload a
    // healthy plugin, so a cached copy would go stale.
    const values = await settings.get();
    return {
      projectIcons: values.projectIcons,
      tabFavicon: values.tabFavicon,
      showBranch: values.showBranch,
      showPullRequests: values.showPullRequests,
    };
  };

  // One load-scoped controller: dispose aborts every in-flight icon fetch, so a
  // reload never leaves a request writing into a replaced registration set.
  const lifetime = new AbortController();
  bb.onDispose(() => lifetime.abort(new Error("Plugin reloaded.")));

  // Includes the personal project: it has no remote, but a user can still give
  // it an icon, and the sidebar shows its threads like any other.
  const allProjects = async () =>
    await bb.sdk.projects.list({ includePersonal: true });

  const listProjects = async (): Promise<IconServiceProject[]> =>
    (await allProjects()).map((project) => ({
      id: project.id,
      gitRemoteUrl: project.gitRemoteUrl,
    }));

  /**
   * Projects in BB's own order, with the position a manual sort drags. The
   * personal project sits outside that order, so it carries no position and is
   * never draggable.
   */
  const projectOrder = async (): Promise<ProjectOrderEntry[]> => {
    let position = 0;
    return (await allProjects()).map((project) => {
      const isPersonal = project.kind === "personal";
      return {
        id: project.id,
        name: project.name,
        isPersonal,
        createdAt: project.createdAt,
        position: isPersonal ? null : position++,
      };
    });
  };

  const preferences = async (): Promise<Preferences> =>
    readPreferences(bb.storage.kv);

  const icons = new IconService({
    kv: bb.storage.kv,
    fetchImpl: fetch as unknown as FetchLike,
    signal: lifetime.signal,
    listProjects,
    onChange: (projectId) => {
      bb.realtime.publish(ICONS_CHANNEL, { projectId });
    },
    log: (message) => bb.log.warn(message),
  });

  bb.rpc.register(rpcContract, {
    overview: async () => {
      const projects = await allProjects();
      const resolved = await icons.iconsFor(
        projects.map((project) => project.id),
      );
      return {
        features: await features(),
        preferences: await preferences(),
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          isPersonal: project.kind === "personal",
          gitRemoteUrl: project.gitRemoteUrl,
          icon: resolved[project.id]!,
        })),
      };
    },
    sidebar: async ({ projectIds }) => ({
      features: await features(),
      preferences: await preferences(),
      projects: await projectOrder(),
      icons: await icons.iconsFor(projectIds),
    }),
    favicon: async ({ projectId }) => {
      const { tabFavicon } = await features();
      if (!tabFavicon) return { enabled: false, dataUrl: null };
      const [icon] = Object.values(await icons.iconsFor([projectId]));
      return { enabled: true, dataUrl: icon?.dataUrl ?? null };
    },
    setIcon: async (input) => ({ icon: await icons.setIcon(input) }),
    setProjectSort: async ({ projectSort }) => ({
      preferences: await writePreferences(bb.storage.kv, { projectSort }),
    }),
    moveProject: async ({ projectId, beforeProjectId }) => {
      const order = await projectOrder();
      const move = resolveProjectMove({
        // Only BB-ordered projects take part; the personal project has no place
        // in that order to move to or from.
        orderedProjectIds: order
          .filter((entry) => entry.position !== null)
          .map((entry) => entry.id),
        projectId,
        beforeProjectId,
      });
      if (move === null) return { projects: order };
      await bb.sdk.projects.reorder({ projectId, ...move });
      return { projects: await projectOrder() };
    },
    refreshIcon: async ({ projectId }) => ({
      icon: await icons.refresh(projectId),
    }),
    addProject: async () => {
      // The picker and the project both live on a host, and only a connected
      // one can show a dialog or read the folder afterwards.
      const hosts = await bb.sdk.hosts.list();
      const host = hosts.find((entry) => entry.status === "connected");
      if (host === undefined)
        throw new Error("No connected host to add a project from.");
      const { path } = await bb.sdk.hosts.pickFolder({
        hostId: host.id,
        clientHostId: host.id,
      });
      // Cancelling the dialog is an answer, not a failure.
      if (path === null) return { projectId: null, name: null };
      const project = await bb.sdk.projects.create({
        name: projectNameFromPath(path),
        source: { type: "local_path", hostId: host.id, path },
      });
      return { projectId: project.id, name: project.name };
    },
    deleteProject: async ({ projectId }) => {
      const projects = await allProjects();
      const project = projects.find((entry) => entry.id === projectId);
      if (project === undefined) throw new Error("No such project.");
      // BB's personal project is a fixture of the app, not a project the user
      // created; the menu hides this, and the server does not rely on that.
      if (project.kind === "personal") {
        throw new Error("The personal project cannot be deleted.");
      }
      await bb.sdk.projects.delete({ projectId });
      return { projects: await projectOrder() };
    },
  });

  // Lazy resolution covers a fresh install (the first sidebar read resolves
  // what it needs); this only keeps long-lived icons honest.
  bb.background.schedule("sweep", SWEEP_CRON, async () => {
    await icons.sweep();
  });

  bb.cli.register({
    name: "better-sidebar",
    summary: "Inspect and set the per-project icons Better Sidebar draws",
    commands: [
      {
        name: "list",
        summary: "List projects with their icon mode, origin, and any error",
        usage: "bb better-sidebar list",
      },
      {
        name: "set",
        summary:
          "Set a project's icon: from its git remote, from a URL, or off",
        usage:
          "bb better-sidebar set <project-id-or-name> --auto | --url <url> | --none",
      },
      {
        name: "refresh",
        summary: "Re-fetch a project's icon now, ignoring the freshness rules",
        usage: "bb better-sidebar refresh <project-id-or-name>",
      },
      {
        name: "sort",
        summary:
          "Show or set how the sidebar orders projects (activity, manual, alphabetical, newest, oldest)",
        usage: "bb better-sidebar sort [mode]",
      },
    ],
    run: async (argv) =>
      runCli(argv, {
        icons,
        listProjects: async () =>
          (await allProjects()).map((project) => ({
            id: project.id,
            name: project.name,
            gitRemoteUrl: project.gitRemoteUrl,
          })),
        readPreferences: preferences,
        writeProjectSort: (projectSort) =>
          writePreferences(bb.storage.kv, { projectSort }),
      }),
  });
}
