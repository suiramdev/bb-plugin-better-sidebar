/**
 * `bb better-sidebar` — the agent-facing view of the same icon store the UI
 * writes. Argv parsing is the plugin's job, so it lives here where it can be
 * tested against a fake service.
 */
import type { PublicIcon } from "./contract";
import type { IconMode } from "./icon-record";

export interface CliProject {
  id: string;
  name: string;
  gitRemoteUrl: string | null;
}

/**
 * The slice of {@link IconService} the CLI uses. Uploading is deliberately
 * absent: `run` executes on the server, so a path argument would name a file on
 * whichever machine typed the command, not on the server's disk.
 */
export interface CliIcons {
  setIcon(input: {
    projectId: string;
    mode: IconMode;
    url?: string;
  }): Promise<PublicIcon>;
  refresh(projectId: string): Promise<PublicIcon>;
  iconsFor(projectIds: readonly string[]): Promise<Record<string, PublicIcon>>;
}

export interface CliDeps {
  icons: CliIcons;
  listProjects: () => Promise<readonly CliProject[]>;
}

export interface CliResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

const USAGE = [
  "Usage:",
  "  bb better-sidebar list",
  "  bb better-sidebar set <project-id-or-name> --auto | --url <url> | --none",
  "  bb better-sidebar refresh <project-id-or-name>",
].join("\n");

function describe(icon: PublicIcon): string {
  const state =
    icon.dataUrl !== null
      ? `icon from ${icon.origin ?? "unknown"}`
      : icon.error !== null
        ? `no icon (${icon.error})`
        : "no icon";
  return `${icon.mode}: ${state}`;
}

/**
 * Resolves a project by exact id, then by exact name, then by unique
 * case-insensitive name prefix — an agent that has a project's display name
 * should not have to look its id up first.
 */
export function findProject(
  projects: readonly CliProject[],
  needle: string,
): { ok: true; project: CliProject } | { ok: false; error: string } {
  const byId = projects.find((project) => project.id === needle);
  if (byId !== undefined) return { ok: true, project: byId };
  const byName = projects.filter((project) => project.name === needle);
  if (byName.length === 1) return { ok: true, project: byName[0]! };
  const lowered = needle.toLowerCase();
  const byPrefix = projects.filter((project) =>
    project.name.toLowerCase().startsWith(lowered),
  );
  if (byPrefix.length === 1) return { ok: true, project: byPrefix[0]! };
  if (byPrefix.length > 1) {
    return {
      ok: false,
      error: `"${needle}" matches ${byPrefix.length} projects: ${byPrefix
        .map((project) => `${project.name} (${project.id})`)
        .join(", ")}.`,
    };
  }
  return { ok: false, error: `No project matches "${needle}".` };
}

export async function runCli(
  argv: readonly string[],
  deps: CliDeps,
): Promise<CliResult> {
  const [command, ...rest] = argv;

  if (command === undefined || command === "help" || command === "--help") {
    return { exitCode: command === undefined ? 1 : 0, stdout: USAGE };
  }

  if (command === "list") {
    const projects = await deps.listProjects();
    const icons = await deps.icons.iconsFor(projects.map((project) => project.id));
    const lines = projects.map((project) => {
      const icon = icons[project.id];
      return [
        project.name,
        `(${project.id})`,
        icon === undefined ? "unknown" : describe(icon),
        project.gitRemoteUrl === null ? "no remote" : project.gitRemoteUrl,
      ].join("  ");
    });
    return {
      exitCode: 0,
      stdout: lines.length === 0 ? "No projects." : lines.join("\n"),
    };
  }

  if (command === "set" || command === "refresh") {
    const [needle, ...flags] = rest;
    if (needle === undefined) {
      return { exitCode: 1, stderr: `A project is required.\n${USAGE}` };
    }
    const found = findProject(await deps.listProjects(), needle);
    if (!found.ok) return { exitCode: 1, stderr: found.error };

    if (command === "refresh") {
      const icon = await deps.icons.refresh(found.project.id);
      return { exitCode: 0, stdout: describe(icon) };
    }

    const mode = readMode(flags);
    if (!mode.ok) return { exitCode: 1, stderr: `${mode.error}\n${USAGE}` };
    const icon = await deps.icons.setIcon({
      projectId: found.project.id,
      mode: mode.mode,
      ...(mode.url === undefined ? {} : { url: mode.url }),
    });
    if (icon.error !== null) {
      return { exitCode: 1, stderr: icon.error, stdout: describe(icon) };
    }
    return { exitCode: 0, stdout: describe(icon) };
  }

  return { exitCode: 1, stderr: `Unknown command "${command}".\n${USAGE}` };
}

function readMode(
  flags: readonly string[],
):
  | { ok: true; mode: IconMode; url?: string }
  | { ok: false; error: string } {
  const urlIndex = flags.indexOf("--url");
  const wantsAuto = flags.includes("--auto");
  const wantsNone = flags.includes("--none");
  const chosen = [urlIndex !== -1, wantsAuto, wantsNone].filter(Boolean).length;
  if (chosen === 0) return { ok: false, error: "Choose --auto, --url, or --none." };
  if (chosen > 1) {
    return { ok: false, error: "Choose exactly one of --auto, --url, --none." };
  }
  if (urlIndex !== -1) {
    const url = flags[urlIndex + 1];
    if (url === undefined || url.startsWith("--")) {
      return { ok: false, error: "--url needs a value." };
    }
    return { ok: true, mode: "url", url };
  }
  return { ok: true, mode: wantsAuto ? "auto" : "none" };
}
