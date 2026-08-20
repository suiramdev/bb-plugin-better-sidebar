/**
 * The frontend's view of this plugin's backend state: project icons, the
 * feature toggles, the sort mode, and the project metadata BB's own sidebar
 * payload does not carry (creation dates and manual positions).
 *
 * One rpc call, refetched when the backend says something changed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type {
  FeatureFlags,
  ProjectOrderEntry,
  PublicIcon,
  rpcContract,
} from "../contract";
import { ICONS_CHANNEL } from "../channels";
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type ProjectSort,
} from "../preferences";
import { announceIconsChanged } from "./favicon-script";
import type { BranchByEnvironmentId } from "./stacking";

export const DEFAULT_FEATURES: FeatureFlags = {
  projectIcons: true,
  tabFavicon: true,
  showBranch: true,
  showPullRequests: false,
  stackedThreads: false,
  worktreeGroups: true,
};

/**
 * The branch facts behind stacked threads, fetched only while the feature is
 * on. Pass an empty list to fetch nothing: each id costs an environment read on
 * the host, so a sidebar with the feature off must not ask at all.
 *
 * A failed read resolves to no stacks rather than an error — the list still
 * renders, just flat.
 */
export function useStackBranches(
  environmentIds: readonly string[],
): BranchByEnvironmentId {
  const rpc = useRpc<typeof rpcContract>();
  const [branches, setBranches] = useState<BranchByEnvironmentId>({});
  // `environmentIdsFor` already sorted and deduplicated these, so the joined
  // key changes only when the set does.
  const key = environmentIds.join(",");
  const latestRequest = useRef(0);

  useEffect(() => {
    if (key === "") {
      setBranches({});
      return;
    }
    const request = ++latestRequest.current;
    void rpc
      .call("stacks", { environmentIds: key.split(",") })
      .then((result) => {
        if (request !== latestRequest.current) return;
        setBranches(result.branches);
      })
      .catch(() => {
        // Leave the last good stacks on screen; the next change tries again.
      });
  }, [key, rpc]);

  return branches;
}

export interface SidebarData {
  features: FeatureFlags;
  preferences: Preferences;
  /** Every project in BB's order, whether or not it has threads on screen. */
  projects: readonly ProjectOrderEntry[];
  icons: Readonly<Record<string, PublicIcon>>;
  refresh: () => void;
  setProjectSort: (projectSort: ProjectSort) => Promise<void>;
  /** Places a project immediately before another, or last when null. */
  moveProject: (
    projectId: string,
    beforeProjectId: string | null,
  ) => Promise<void>;
  /**
   * Opens the host's folder picker and adds the chosen folder as a project.
   * Resolves to the new project's id, or null when the user cancelled.
   */
  addProject: () => Promise<string | null>;
  /** Removes a project from BB, threads and all. There is no undo. */
  deleteProject: (projectId: string) => Promise<void>;
  /**
   * Archives every thread in a worktree and resolves to the ones the host
   * actually took, so the caller can report the count and notice whether the
   * thread on screen was among them.
   */
  archiveWorktree: (environmentId: string) => Promise<string[]>;
  /** Renames a worktree, or clears the name back to its branch with null. */
  renameWorktree: (environmentId: string, name: string | null) => Promise<void>;
}

export function useSidebarData(projectIds: readonly string[]): SidebarData {
  const rpc = useRpc<typeof rpcContract>();
  const [features, setFeatures] = useState<FeatureFlags>(DEFAULT_FEATURES);
  const [preferences, setPreferences] =
    useState<Preferences>(DEFAULT_PREFERENCES);
  const [projects, setProjects] = useState<readonly ProjectOrderEntry[]>([]);
  const [icons, setIcons] = useState<Record<string, PublicIcon>>({});
  // A stable key: the same projects in a different array order must not refetch.
  const key = useMemo(
    () => [...new Set(projectIds)].sort().join(","),
    [projectIds],
  );
  const latestRequest = useRef(0);

  const load = useCallback(() => {
    const request = ++latestRequest.current;
    const ids = key === "" ? [] : key.split(",");
    void rpc
      .call("sidebar", { projectIds: ids })
      .then((result) => {
        if (request !== latestRequest.current) return;
        setFeatures(result.features);
        setPreferences(result.preferences);
        setProjects(result.projects);
        setIcons(result.icons);
      })
      .catch(() => {
        // A failed read leaves the last good icons on screen; the next signal
        // or reconnect tries again.
      });
  }, [key, rpc]);

  useEffect(load, [load]);

  useRealtime(ICONS_CHANNEL, () => {
    load();
    // The tab favicon lives in a content script with no hooks of its own.
    announceIconsChanged();
  });

  // Plugin signals are ephemeral and never replayed, so a socket that dropped
  // may have missed a change: reconcile on every reconnect after the first.
  const connectionState = useRealtimeConnectionState();
  const hasConnected = useRef(false);
  useEffect(() => {
    if (connectionState !== "connected") return;
    if (hasConnected.current) load();
    hasConnected.current = true;
  }, [connectionState, load]);

  const setProjectSort = useCallback(
    async (projectSort: ProjectSort) => {
      // Optimistic: reordering the list must feel like a click, not a request.
      setPreferences({ projectSort });
      try {
        const result = await rpc.call("setProjectSort", { projectSort });
        setPreferences(result.preferences);
      } catch (error) {
        load();
        throw error;
      }
    },
    [load, rpc],
  );

  const moveProject = useCallback(
    async (projectId: string, beforeProjectId: string | null) => {
      const result = await rpc.call("moveProject", {
        projectId,
        beforeProjectId,
      });
      setProjects(result.projects);
    },
    [rpc],
  );

  const addProject = useCallback(async () => {
    const result = await rpc.call("addProject", null);
    // A new project changes the order this hook owns; the host refetches its
    // own thread list.
    if (result.projectId !== null) load();
    return result.projectId;
  }, [load, rpc]);
  const deleteProject = useCallback(
    async (projectId: string) => {
      const result = await rpc.call("deleteProject", { projectId });
      setProjects(result.projects);
      // The threads of a deleted project are gone from the host's list too, and
      // that list is not this hook's to refetch.
      load();
    },
    [load, rpc],
  );

  const archiveWorktree = useCallback(
    async (environmentId: string) => {
      const result = await rpc.call("archiveWorktree", { environmentId });
      // The archived threads leave the host's own list, which this hook does
      // not own, so there is nothing local to reconcile.
      return result.archivedThreadIds;
    },
    [rpc],
  );

  const renameWorktree = useCallback(
    async (environmentId: string, name: string | null) => {
      await rpc.call("renameWorktree", { environmentId, name });
    },
    [rpc],
  );

  return {
    features,
    preferences,
    projects,
    icons,
    refresh: load,
    setProjectSort,
    moveProject,
    addProject,
    deleteProject,
    archiveWorktree,
    renameWorktree,
  };
}
