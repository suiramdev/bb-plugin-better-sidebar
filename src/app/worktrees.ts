/**
 * Threads that share a worktree, drawn as one group — BB's own sidebar
 * behaviour, which this list had dropped.
 *
 * BB folds sibling threads that sit in the same worktree under a synthetic
 * header naming that worktree, so a checkout you have three threads going in
 * reads as one thing rather than three unrelated rows that happen to share a
 * branch label. The rules here are BB's, from
 * `packages/client-core/src/sidebar/projectThreadGroups.ts`:
 *
 * - only *worktree* environments group. `workspaceDisplayKind: "other"` is a
 *   thread running in the project directory itself, and every such thread in a
 *   project would otherwise collapse into one meaningless pile;
 * - a group needs at least two threads. A lone thread in its own worktree is
 *   already legible as itself, and wrapping it in a header would add a row to
 *   say nothing;
 * - grouping applies at every sibling level, not just the roots.
 *
 * This is a view transform, not a change to the thread tree: it takes one
 * sibling list and returns the render slots for it. `ThreadNode.children` stays
 * a plain node list, so `grouping.ts` and `stacking.ts` are untouched and the
 * recursion falls out of the renderer calling this once per level.
 */
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { ThreadNode } from "./grouping";

/** The header's fallback name, when a worktree has neither name nor branch. */
const UNNAMED_WORKTREE = "Worktree";

export interface WorktreeGroup {
  environmentId: string;
  /** The worktree's name, else its branch, else "Worktree". */
  name: string;
  /** At least two, in the order they were given. */
  nodes: ThreadNode[];
  /** Every thread under the header, nesting included. */
  threadCount: number;
}

/**
 * One render slot in a sibling list. Threads and worktree groups interleave, so
 * a renderer walks one ordered list rather than two parallel ones.
 */
export type ThreadItem =
  | { kind: "thread"; node: ThreadNode }
  | { kind: "worktree"; group: WorktreeGroup };

/**
 * A thread's worktree, or null when it is not in one.
 *
 * `"other"` is excluded on purpose: it means the thread runs in the project
 * checkout rather than a worktree of its own, which is not a grouping the user
 * would recognise.
 */
function worktreeIdOf(thread: PluginSidebarThread): string | null {
  const environment = thread.environment;
  if (environment === null || environment.id === null) return null;
  const kind = environment.workspaceDisplayKind;
  if (kind !== "managed-worktree" && kind !== "unmanaged-worktree") return null;
  return environment.id;
}

export function worktreeName(thread: PluginSidebarThread): string {
  const environment = thread.environment;
  const name = environment?.name ?? null;
  if (name !== null && name.trim() !== "") return name;
  const branchName = environment?.branchName ?? null;
  if (branchName !== null && branchName.trim() !== "") return branchName;
  return UNNAMED_WORKTREE;
}

function countNodes(nodes: readonly ThreadNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + countNodes(node.children),
    0,
  );
}

/**
 * Turns one sibling list into its render slots.
 *
 * A group takes the place of its first member, so whatever order the caller
 * sorted the list into survives: the group sits exactly where the most relevant
 * thread in it already sat, and the rest are lifted out from below. Re-sorting
 * here would quietly override the caller's rule.
 *
 * A node carrying a `stackPosition` is skipped. That thread is already inside a
 * stack, where it is numbered by the branch it sits on and shares that number
 * with anything else in its worktree — grouping it a second time would be the
 * same statement told twice, in two competing shapes.
 */
export function groupWorktrees(nodes: readonly ThreadNode[]): ThreadItem[] {
  const byWorktree = new Map<string, ThreadNode[]>();
  for (const node of nodes) {
    if (node.stackPosition !== null) continue;
    const environmentId = worktreeIdOf(node.thread);
    if (environmentId === null) continue;
    const bucket = byWorktree.get(environmentId);
    if (bucket === undefined) byWorktree.set(environmentId, [node]);
    else bucket.push(node);
  }

  const grouped = new Map<string, ThreadNode[]>();
  for (const [environmentId, bucket] of byWorktree) {
    if (bucket.length >= 2) grouped.set(environmentId, bucket);
  }
  if (grouped.size === 0) {
    return nodes.map((node) => ({ kind: "thread", node }));
  }

  const emitted = new Set<string>();
  const items: ThreadItem[] = [];
  for (const node of nodes) {
    const environmentId =
      node.stackPosition === null ? worktreeIdOf(node.thread) : null;
    const bucket = environmentId === null ? undefined : grouped.get(environmentId);
    if (bucket === undefined || environmentId === null) {
      items.push({ kind: "thread", node });
      continue;
    }
    // Every member after the first is drawn inside the header this one opened.
    if (emitted.has(environmentId)) continue;
    emitted.add(environmentId);
    items.push({
      kind: "worktree",
      group: {
        environmentId,
        name: worktreeName(node.thread),
        nodes: bucket,
        threadCount: countNodes(bucket),
      },
    });
  }
  return items;
}

/**
 * The thread ids a sibling list draws, top to bottom, once grouping is applied.
 *
 * A collapsed worktree contributes nothing, exactly as a collapsed project
 * does: a shift-click range must never sweep up rows that are not on screen.
 */
export function groupedThreadIds(
  nodes: readonly ThreadNode[],
  isWorktreeExpanded: (environmentId: string) => boolean,
): string[] {
  const ids: string[] = [];
  const pushNode = (node: ThreadNode): void => {
    ids.push(node.thread.id);
    ids.push(...groupedThreadIds(node.children, isWorktreeExpanded));
  };
  for (const item of groupWorktrees(nodes)) {
    if (item.kind === "thread") {
      pushNode(item.node);
      continue;
    }
    if (!isWorktreeExpanded(item.group.environmentId)) continue;
    for (const node of item.group.nodes) pushNode(node);
  }
  return ids;
}
