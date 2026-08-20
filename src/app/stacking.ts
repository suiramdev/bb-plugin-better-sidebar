/**
 * Stacked threads: when one thread's branch is based on another's, they are a
 * stack — the same shape a stacked pull request has on a git host.
 *
 * The linkage is a *branch* fact, not a thread one. BB's `parentThreadId` is
 * orchestration ("the parent coordinates the child"), and it is chosen
 * independently of `--base-branch`; two threads can even share one worktree, in
 * which case neither is based on the other. So this reads the environment's
 * `baseBranch` and nothing else.
 *
 * A post-pass over the built groups rather than part of `buildGroups`, so that
 * with the feature off the sidebar keeps exactly the shape it had.
 */
import type { EnvironmentBranch } from "../contract";
import type { ProjectGroup, ThreadNode } from "./grouping";

export type BranchByEnvironmentId = Readonly<
  Record<string, EnvironmentBranch | undefined>
>;

/** One branch on screen, with every thread sitting on it. */
interface StackBranch {
  branch: EnvironmentBranch;
  /** A worktree can hold more than one thread; they share a position. */
  nodes: ThreadNode[];
  children: StackBranch[];
  createdAt: number;
}

/**
 * Depth-first over the whole forest — a stack can start anywhere, including
 * under a thread that is itself nested by `parentThreadId`.
 */
function flatten(nodes: readonly ThreadNode[]): ThreadNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function branchOf(
  node: ThreadNode,
  branches: BranchByEnvironmentId,
): EnvironmentBranch | null {
  const environmentId = node.thread.environment?.id ?? null;
  if (environmentId === null) return null;
  const branch = branches[environmentId];
  if (branch === undefined || branch.branchName === null) return null;
  return branch;
}

/**
 * bb records a base as it was passed to git, so it may carry a remote prefix
 * ("origin/dev") while `defaultBranch` and every `branchName` are bare ("dev").
 * Comparing the two forms directly would miss, so both are tried.
 *
 * Only the first segment is dropped, and only as a fallback after the exact
 * name fails, so a real branch called "feat/dev" is never mistaken for trunk.
 */
function withoutRemote(ref: string): string | null {
  const slash = ref.indexOf("/");
  return slash === -1 ? null : ref.slice(slash + 1);
}

/** Every spelling of a base worth matching, most specific first. */
function baseCandidates(baseBranch: string): string[] {
  const stripped = withoutRemote(baseBranch);
  return stripped === null ? [baseBranch] : [baseBranch, stripped];
}

/**
 * The branch a node is stacked on, or null when it sits on trunk. A branch cut
 * from the default branch is the *bottom* of a stack, not a link in one, which
 * is what keeps every ordinary feature branch out of this.
 */
function baseOf(branch: EnvironmentBranch): string | null {
  const { baseBranch, branchName, defaultBranch } = branch;
  if (baseBranch === null || baseBranch === "") return null;
  const candidates = baseCandidates(baseBranch);
  if (branchName !== null && candidates.includes(branchName)) return null;
  // Trunk, however it is spelled: "dev" and "origin/dev" are the same branch,
  // and a branch cut from it starts a stack rather than joining one.
  if (defaultBranch !== null && candidates.includes(defaultBranch)) return null;
  return baseBranch;
}

/** Oldest first: a stack is read bottom-up, in the order it was built. */
function byCreation(left: ThreadNode, right: ThreadNode): number {
  return left.thread.createdAt - right.thread.createdAt;
}

/** One entry per branch, so threads sharing a worktree share a position. */
function indexBranches(
  roots: readonly ThreadNode[],
  branches: BranchByEnvironmentId,
): Map<string, StackBranch> {
  const byBranch = new Map<string, StackBranch>();
  for (const node of flatten(roots)) {
    const branch = branchOf(node, branches);
    if (branch === null || branch.branchName === null) continue;
    const existing = byBranch.get(branch.branchName);
    if (existing === undefined) {
      byBranch.set(branch.branchName, {
        branch,
        nodes: [node],
        children: [],
        createdAt: node.thread.createdAt,
      });
      continue;
    }
    existing.nodes.push(node);
    existing.createdAt = Math.min(existing.createdAt, node.thread.createdAt);
  }
  return byBranch;
}

/**
 * The on-screen branch an entry is stacked on. Tries the base exactly as bb
 * recorded it, then without its remote prefix, so "origin/feat/x" still finds
 * the environment sitting on "feat/x".
 */
function baseEntryOf(
  entry: StackBranch,
  byBranch: ReadonlyMap<string, StackBranch>,
): StackBranch | undefined {
  const base = baseOf(entry.branch);
  if (base === null) return undefined;
  for (const candidate of baseCandidates(base)) {
    const found = byBranch.get(candidate);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** True when walking `entry`'s bases reaches `branchName` — i.e. a cycle. */
function descends(
  entry: StackBranch,
  branchName: string,
  byBranch: ReadonlyMap<string, StackBranch>,
): boolean {
  const seen = new Set<StackBranch>();
  let current: StackBranch | undefined = entry;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    if (current.branch.branchName === branchName) return true;
    current = baseEntryOf(current, byBranch);
  }
  return false;
}

/**
 * Links each branch to the one it was cut from, when that branch is on screen
 * too, and reports the branches that became someone's child. A base that is
 * absent, archived, or filtered out simply leaves a root.
 */
function linkBranches(byBranch: ReadonlyMap<string, StackBranch>): Set<string> {
  const stacked = new Set<string>();
  for (const [branchName, entry] of byBranch) {
    const parent = baseEntryOf(entry, byBranch);
    if (parent === undefined || parent === entry) continue;
    // A cycle is a corrupt base chain, not a stack; leave it flat.
    if (descends(parent, branchName, byBranch)) continue;
    parent.children.push(entry);
    stacked.add(branchName);
  }
  return stacked;
}

/** Depth-first, oldest branch first, excluding the entry itself. */
function descendants(entry: StackBranch): StackBranch[] {
  return [...entry.children]
    .sort((left, right) => left.createdAt - right.createdAt)
    .flatMap((child) => [child, ...descendants(child)]);
}

/**
 * One stack as a flat run of levels, bottom first.
 *
 * Every level is a branch and every branch is a worktree, so a level is drawn
 * by the same rule as any other worktree: one thread is a row, several are a
 * group. Numbering starts at 1 — the bottom included — so the numbers form one
 * unbroken column and the base is not a special case.
 *
 * This used to hang the whole stack off its bottom *thread*, which made that
 * one thread both a row and the stack's container. The bottom could then never
 * be a group, and its siblings had to be shoved into the layer beneath it as
 * peers of the branches built on top of them — two different relationships
 * drawn as one. A run of levels has no container to appoint, so the question
 * does not arise.
 */
function buildStackLevels(bottom: StackBranch): ThreadNode[] {
  const levels: ThreadNode[] = [];
  let position = 0;
  for (const entry of [bottom, ...descendants(bottom)]) {
    position += 1;
    for (const node of [...entry.nodes].sort(byCreation)) {
      // One level deep: a stacked thread's own nesting is folded into the
      // stack, so the list stays a flat, numbered read.
      levels.push({ ...node, children: [], stackPosition: position });
    }
  }
  return levels;
}

/** Drops threads a stack claimed, and re-roots stacks found underneath. */
function prune(
  node: ThreadNode,
  consumed: ReadonlySet<string>,
  rebuilt: ReadonlyMap<string, readonly ThreadNode[]>,
): ThreadNode {
  const children: ThreadNode[] = [];
  for (const child of node.children) {
    const stacked = rebuilt.get(child.thread.id);
    if (stacked !== undefined) {
      // The whole run lands here: a stack found under an ordinary thread is
      // still a run of levels, just one indent further in.
      children.push(...stacked);
      continue;
    }
    if (consumed.has(child.thread.id)) continue;
    children.push(prune(child, consumed, rebuilt));
  }
  return { ...node, children };
}

function stackRoots(
  roots: readonly ThreadNode[],
  branches: BranchByEnvironmentId,
): ThreadNode[] {
  const byBranch = indexBranches(roots, branches);
  const stacked = linkBranches(byBranch);

  const bottoms = [...byBranch.entries()].filter(
    ([branchName, entry]) =>
      !stacked.has(branchName) && entry.children.length > 0,
  );
  if (bottoms.length === 0) return [...roots];

  const rebuilt = new Map<string, readonly ThreadNode[]>();
  const consumed = new Set<string>();
  for (const [, bottom] of bottoms) {
    for (const entry of [bottom, ...descendants(bottom)]) {
      for (const node of entry.nodes) consumed.add(node.thread.id);
    }
    const levels = buildStackLevels(bottom);
    // Keyed on the bottom level's first thread, which is where the run is
    // spliced back in so the stack keeps the place that thread had earned.
    const anchor = levels[0];
    if (anchor === undefined) continue;
    rebuilt.set(anchor.thread.id, levels);
  }

  // Keep the order the sort already chose: a stack takes the place of its
  // bottom thread, and threads pulled into a stack drop out.
  const result: ThreadNode[] = [];
  for (const node of roots) {
    const stack = rebuilt.get(node.thread.id);
    if (stack !== undefined) {
      result.push(...stack);
      continue;
    }
    if (consumed.has(node.thread.id)) continue;
    result.push(prune(node, consumed, rebuilt));
  }
  // A stack whose bottom was nested under another thread has no root row yet.
  for (const [threadId, levels] of rebuilt) {
    if (result.some((node) => node.thread.id === threadId)) continue;
    result.push(...levels);
  }
  return result;
}

/**
 * Rebuilds each project's roots so that a stack is one flat run of levels,
 * bottom first, numbered from 1 in depth-first order. A level with several
 * threads on it is folded into a worktree group by the renderer, which is what
 * lets every level — the bottom included — be drawn by one rule.
 *
 * Threads outside a stack keep the nesting they already had.
 */
export function applyStacks(
  groups: readonly ProjectGroup[],
  branches: BranchByEnvironmentId,
): ProjectGroup[] {
  return groups.map((group) => ({
    ...group,
    pinned: stackRoots(group.pinned, branches),
    roots: stackRoots(group.roots, branches),
  }));
}

/**
 * The environments a sidebar needs stack facts for. Only threads that have one
 * cost a lookup, and each environment is asked about once however many threads
 * share it. Sorted so the result is a stable cache key.
 */
export function environmentIdsFor(groups: readonly ProjectGroup[]): string[] {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const node of flatten([...group.pinned, ...group.roots])) {
      const id = node.thread.environment?.id ?? null;
      if (id !== null) ids.add(id);
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}
