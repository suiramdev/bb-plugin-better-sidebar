/**
 * Turning the host's flat thread array into what this sidebar draws: one group
 * per project, pinned threads first, children nested under their parent.
 *
 * Pure on purpose — the ordering and search rules are the substance of a
 * replaced sidebar, and they are worth testing without a DOM.
 */
import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import type { ProjectOrderEntry } from "../contract";
import type { ProjectSort } from "../preferences";

export interface ThreadNode {
  thread: PluginSidebarThread;
  children: ThreadNode[];
  /** Kept only to hold a matching descendant during a search. */
  isSearchAncestor: boolean;
}

export interface ProjectGroup {
  projectId: string;
  projectName: string;
  isPersonal: boolean;
  /** Index in BB's manual order; null for the personal project. */
  position: number | null;
  pinned: ThreadNode[];
  roots: ThreadNode[];
  /** Every thread in the group, nesting included. */
  threadCount: number;
}

export function threadTitle(thread: PluginSidebarThread): string {
  const title = thread.title ?? thread.titleFallback;
  return title !== null && title.trim() !== "" ? title : "Untitled thread";
}

/** The one-line context under a title: the worktree branch, else the machine. */
export function threadSubtitle(thread: PluginSidebarThread): string | null {
  const branchName = thread.environment?.branchName ?? null;
  if (branchName !== null && branchName !== "") return branchName;
  return thread.host?.name ?? null;
}

function matchesQuery(thread: PluginSidebarThread, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  const haystacks = [
    threadTitle(thread),
    thread.environment?.branchName ?? "",
    thread.host?.name ?? "",
  ];
  return haystacks.some((value) => value.toLowerCase().includes(needle));
}

/**
 * Newest attention first, the way bb's own sidebar reads at rest. Attention
 * leads and `updatedAt` only breaks ties, so a background write on an old
 * thread does not jump it over one the user just looked at.
 */
function byRecency(left: ThreadNode, right: ThreadNode): number {
  return (
    right.thread.latestAttentionAt - left.thread.latestAttentionAt ||
    right.thread.updatedAt - left.thread.updatedAt ||
    right.thread.createdAt - left.thread.createdAt
  );
}

/** Children read oldest first, so a spawn order stays legible. */
function byCreation(left: ThreadNode, right: ThreadNode): number {
  return left.thread.createdAt - right.thread.createdAt;
}

function countNodes(nodes: readonly ThreadNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

export interface BuildGroupsArgs {
  threads: readonly PluginSidebarThread[];
  projects: readonly PluginSidebarProject[];
  /**
   * Creation dates and BB order positions from this plugin's backend, which the
   * host's sidebar payload does not carry. Missing entries sort last.
   */
  projectOrder?: readonly ProjectOrderEntry[];
  sort?: ProjectSort;
  searchQuery: string;
  /**
   * Kept as an empty group when it has no threads, so the project in view
   * always shows its header — and therefore its icon.
   */
  activeProjectId: string | null;
}

/**
 * Groups by project, ordered by the most recent activity in each group. A
 * search keeps a non-matching parent only when a descendant matches, which is
 * what stops a match from disappearing because its parent is off-query.
 */
export function buildGroups({
  threads,
  projects,
  projectOrder = [],
  sort = "activity",
  searchQuery,
  activeProjectId,
}: BuildGroupsArgs): ProjectGroup[] {
  const orderById = new Map(projectOrder.map((entry) => [entry.id, entry]));
  const visible = threads.filter((thread) => !thread.isArchived);
  const byId = new Map(visible.map((thread) => [thread.id, thread]));
  const matched = new Set(
    visible.filter((thread) => matchesQuery(thread, searchQuery)).map((t) => t.id),
  );

  // A matching thread pulls its ancestors in, marked so a row can render them
  // as context rather than as results.
  const kept = new Set(matched);
  for (const id of matched) {
    let parentId = byId.get(id)?.parentThreadId ?? null;
    while (parentId !== null && !kept.has(parentId)) {
      kept.add(parentId);
      parentId = byId.get(parentId)?.parentThreadId ?? null;
    }
  }

  const nodes = new Map<string, ThreadNode>();
  for (const thread of visible) {
    if (!kept.has(thread.id)) continue;
    nodes.set(thread.id, {
      thread,
      children: [],
      isSearchAncestor: !matched.has(thread.id),
    });
  }

  const groups = new Map<string, ProjectGroup>();
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const groupFor = (projectId: string): ProjectGroup => {
    const existing = groups.get(projectId);
    if (existing !== undefined) return existing;
    const project = projectById.get(projectId);
    const entry = orderById.get(projectId);
    const group: ProjectGroup = {
      projectId,
      projectName: project?.name ?? entry?.name ?? "Unknown project",
      isPersonal: project?.isPersonal ?? entry?.isPersonal ?? false,
      position: entry?.position ?? null,
      pinned: [],
      roots: [],
      threadCount: 0,
    };
    groups.set(projectId, group);
    return group;
  };

  if (activeProjectId !== null && projectById.has(activeProjectId)) {
    groupFor(activeProjectId);
  }

  for (const node of nodes.values()) {
    const parentId = node.thread.parentThreadId;
    const parent = parentId === null ? undefined : nodes.get(parentId);
    if (parent !== undefined && parent.thread.projectId === node.thread.projectId) {
      parent.children.push(node);
      continue;
    }
    // A root, or an orphan whose parent is filtered out or archived: either way
    // it needs a place in the list rather than vanishing.
    const group = groupFor(node.thread.projectId);
    if (node.thread.isPinned) group.pinned.push(node);
    else group.roots.push(node);
  }

  for (const node of nodes.values()) node.children.sort(byCreation);
  for (const group of groups.values()) {
    group.pinned.sort(byRecency);
    group.roots.sort(byRecency);
    group.threadCount = countNodes(group.pinned) + countNodes(group.roots);
  }

  return sortGroups([...groups.values()], {
    sort,
    activeProjectId,
    createdAtById: new Map(
      projectOrder.map((entry) => [entry.id, entry.createdAt]),
    ),
  });
}

function groupRecency(group: ProjectGroup): number {
  return [...group.pinned, ...group.roots].reduce(
    (latest, node) => Math.max(latest, node.thread.latestAttentionAt),
    0,
  );
}

/**
 * Orders the project groups. Only "activity" floats the project in view to the
 * top: in an order the user chose — manual, alphabetical, or by creation — a
 * group jumping because of the route would be the sidebar disobeying them.
 *
 * Ties and unknown metadata fall back to the project name, so the list has a
 * stable order even while the backend read is still in flight.
 */
export function sortGroups(
  groups: readonly ProjectGroup[],
  {
    sort,
    activeProjectId,
    createdAtById,
  }: {
    sort: ProjectSort;
    activeProjectId: string | null;
    createdAtById: ReadonlyMap<string, number>;
  },
): ProjectGroup[] {
  const byName = (left: ProjectGroup, right: ProjectGroup): number =>
    left.projectName.localeCompare(right.projectName, undefined, {
      sensitivity: "base",
    });
  const created = (group: ProjectGroup): number | null =>
    createdAtById.get(group.projectId) ?? null;

  const compare = (left: ProjectGroup, right: ProjectGroup): number => {
    switch (sort) {
      case "manual":
        // The personal project has no place in BB's order, so it sits last.
        if (left.position === null || right.position === null) {
          return (left.position === null ? 1 : 0) - (right.position === null ? 1 : 0);
        }
        return left.position - right.position;
      case "alphabetical":
        return byName(left, right);
      case "newest":
      case "oldest": {
        const leftCreated = created(left);
        const rightCreated = created(right);
        if (leftCreated === null || rightCreated === null) {
          return (leftCreated === null ? 1 : 0) - (rightCreated === null ? 1 : 0);
        }
        return sort === "newest"
          ? rightCreated - leftCreated
          : leftCreated - rightCreated;
      }
      default: {
        if (left.projectId === activeProjectId) return -1;
        if (right.projectId === activeProjectId) return 1;
        return groupRecency(right) - groupRecency(left);
      }
    }
  };

  return [...groups].sort((left, right) => compare(left, right) || byName(left, right));
}
