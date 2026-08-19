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
  searchQuery,
  activeProjectId,
}: BuildGroupsArgs): ProjectGroup[] {
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
    const group: ProjectGroup = {
      projectId,
      projectName: project?.name ?? "Unknown project",
      isPersonal: project?.isPersonal ?? false,
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

  return [...groups.values()].sort((left, right) => {
    // The active project leads; the rest follow their own recency.
    if (left.projectId === activeProjectId) return -1;
    if (right.projectId === activeProjectId) return 1;
    return groupRecency(right) - groupRecency(left);
  });
}

function groupRecency(group: ProjectGroup): number {
  return [...group.pinned, ...group.roots].reduce(
    (latest, node) => Math.max(latest, node.thread.latestAttentionAt),
    0,
  );
}
