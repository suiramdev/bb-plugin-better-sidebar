import { expect, test } from "vitest";
import { buildGroups, type ThreadNode } from "./grouping";
import {
  applyStacks,
  environmentIdsFor,
  type BranchByEnvironmentId,
} from "./stacking";
import { makeProject, makeThread } from "./test-fixtures";

const PROJECTS = [makeProject({ id: "proj_1" })];

function environment(id: string) {
  return {
    id,
    name: id,
    branchName: null,
    workspaceDisplayKind: "managed-worktree" as const,
  };
}

/** A thread on its own worktree, created at `createdAt`. */
function threadOn(id: string, environmentId: string, createdAt: number) {
  return makeThread({
    id,
    environment: environment(environmentId),
    createdAt,
    latestAttentionAt: createdAt,
  });
}

function branch(
  branchName: string,
  baseBranch: string | null,
): BranchByEnvironmentId[string] {
  return { branchName, baseBranch, defaultBranch: "main" };
}

function groupsFor(
  threads: ReturnType<typeof makeThread>[],
  branches: BranchByEnvironmentId,
) {
  const groups = buildGroups({
    threads,
    projects: PROJECTS,
    searchQuery: "",
    activeProjectId: null,
  });
  return applyStacks(groups, branches);
}

/** "title:position" per row, nesting shown by indentation depth. */
function shape(nodes: readonly ThreadNode[], depth = 0): string[] {
  return nodes.flatMap((node) => [
    `${"  ".repeat(depth)}${node.thread.id}:${node.stackPosition ?? "-"}`,
    ...shape(node.children, depth + 1),
  ]);
}

test("a chain of branches becomes one flat run, numbered from the bottom", () => {
  const threads = [
    threadOn("auth", "env_a", 1),
    threadOn("hash", "env_b", 2),
    threadOn("refresh", "env_c", 3),
  ];
  const branches = {
    env_a: branch("feat/auth", "main"),
    env_b: branch("feat/hash", "feat/auth"),
    env_c: branch("feat/refresh", "feat/hash"),
  };

  const [group] = groupsFor(threads, branches);

  // Every level is numbered, the bottom included: the numbers are the spine
  // that says these rows are one stack.
  expect(shape(group!.roots)).toEqual(["auth:1", "hash:2", "refresh:3"]);
});

test("a stack that forks flattens depth-first, so numbers follow the chain", () => {
  // auth ─┬─ hash ── refresh
  //       └─ ratelimit
  const threads = [
    threadOn("auth", "env_a", 1),
    threadOn("hash", "env_b", 2),
    threadOn("refresh", "env_c", 3),
    threadOn("ratelimit", "env_d", 4),
  ];
  const branches = {
    env_a: branch("feat/auth", "main"),
    env_b: branch("feat/hash", "feat/auth"),
    env_c: branch("feat/refresh", "feat/hash"),
    env_d: branch("feat/ratelimit", "feat/auth"),
  };

  const [group] = groupsFor(threads, branches);

  // refresh is 3 because it sits on hash; ratelimit is the second branch off
  // the bottom and therefore 4.
  expect(shape(group!.roots)).toEqual([
    "auth:1",
    "hash:2",
    "refresh:3",
    "ratelimit:4",
  ]);
});

test("threads on branches cut from trunk are not a stack", () => {
  const threads = [threadOn("auth", "env_a", 1), threadOn("docs", "env_b", 2)];
  const branches = {
    env_a: branch("feat/auth", "main"),
    env_b: branch("feat/docs", "main"),
  };

  const [group] = groupsFor(threads, branches);

  expect(shape(group!.roots)).toEqual(["docs:-", "auth:-"]);
});

test("a parent/child thread pair on one worktree is not a stack", () => {
  // The case that rules out parentThreadId as the signal: bb lets a coding
  // thread and a review thread share an environment, so neither is based on
  // the other however they are parented.
  const threads = [
    threadOn("code", "env_a", 1),
    makeThread({
      id: "review",
      parentThreadId: "code",
      environment: environment("env_a"),
      createdAt: 2,
    }),
  ];
  const branches = { env_a: branch("feat/auth", "main") };

  const [group] = groupsFor(threads, branches);

  expect(shape(group!.roots)).toEqual(["code:-", "  review:-"]);
});

test("threads sharing a stacked branch share its position", () => {
  const threads = [
    threadOn("auth", "env_a", 1),
    threadOn("hash", "env_b", 2),
    threadOn("hash-review", "env_b", 3),
    threadOn("refresh", "env_c", 4),
  ];
  const branches = {
    env_a: branch("feat/auth", "main"),
    env_b: branch("feat/hash", "feat/auth"),
    env_c: branch("feat/refresh", "feat/hash"),
  };

  const [group] = groupsFor(threads, branches);

  // Two threads on one stacked branch share its number; the renderer folds
  // them into a single group carrying it once.
  expect(shape(group!.roots)).toEqual([
    "auth:1",
    "hash:2",
    "hash-review:2",
    "refresh:3",
  ]);
});

test("a stack is a flat run however long the chain is", () => {
  const threads = [
    threadOn("a", "env_a", 1),
    threadOn("b", "env_b", 2),
    threadOn("c", "env_c", 3),
    threadOn("d", "env_d", 4),
    threadOn("e", "env_e", 5),
  ];
  const branches = {
    env_a: branch("a", "main"),
    env_b: branch("b", "a"),
    env_c: branch("c", "b"),
    env_d: branch("d", "c"),
    env_e: branch("e", "d"),
  };

  const [group] = groupsFor(threads, branches);
  const depths = shape(group!.roots).map(
    (line) => (line.length - line.trimStart().length) / 2,
  );

  // No nesting at all now: a stack is a run of sibling levels.
  expect(Math.max(...depths)).toBe(0);
  expect(shape(group!.roots)).toEqual([
    "a:1",
    "b:2",
    "c:3",
    "d:4",
    "e:5",
  ]);
});

test("a base branch that is not on screen leaves its thread a plain root", () => {
  const threads = [threadOn("hash", "env_b", 1)];
  const branches = { env_b: branch("feat/hash", "feat/auth") };

  const [group] = groupsFor(threads, branches);

  expect(shape(group!.roots)).toEqual(["hash:-"]);
});

test("a cyclic base chain is left flat rather than looping", () => {
  const threads = [threadOn("a", "env_a", 1), threadOn("b", "env_b", 2)];
  const branches = {
    env_a: branch("a", "b"),
    env_b: branch("b", "a"),
  };

  const [group] = groupsFor(threads, branches);

  expect(shape(group!.roots).length).toBe(2);
});

test("threads with no environment are untouched", () => {
  const threads = [
    makeThread({ id: "loose", createdAt: 1, latestAttentionAt: 1 }),
    threadOn("auth", "env_a", 2),
    threadOn("hash", "env_b", 3),
  ];
  const branches = {
    env_a: branch("feat/auth", "main"),
    env_b: branch("feat/hash", "feat/auth"),
  };

  const [group] = groupsFor(threads, branches);

  expect(shape(group!.roots)).toEqual(["auth:1", "hash:2", "loose:-"]);
});

test("with no branch facts the list keeps the shape it already had", () => {
  const threads = [
    threadOn("auth", "env_a", 1),
    makeThread({ id: "child", parentThreadId: "auth", createdAt: 2 }),
  ];

  const groups = buildGroups({
    threads,
    projects: PROJECTS,
    searchQuery: "",
    activeProjectId: null,
  });

  expect(shape(applyStacks(groups, {})[0]!.roots)).toEqual(
    shape(groups[0]!.roots),
  );
});

test("only environments on screen are asked about, once each", () => {
  const threads = [
    threadOn("a", "env_a", 1),
    threadOn("b", "env_b", 2),
    threadOn("c", "env_b", 3),
    makeThread({ id: "none", createdAt: 4 }),
  ];

  const groups = buildGroups({
    threads,
    projects: PROJECTS,
    searchQuery: "",
    activeProjectId: null,
  });

  expect(environmentIdsFor(groups)).toEqual(["env_a", "env_b"]);
});

/**
 * The real shape from a bb worktree stack: bb records the base as it was passed
 * to git ("origin/dev"), while `defaultBranch` and every `branchName` are bare
 * ("dev"). Taken verbatim from `bb environment show` on a live GitLab stack.
 */
test("a remote-prefixed trunk is recognised as trunk, not as a stack link", () => {
  const threads = [
    threadOn("shell", "env_fawx2zfrwb", 1),
    threadOn("pane", "env_js44wt6e7t", 2),
    threadOn("cli", "env_armnj6eprc", 3),
    threadOn("pan", "env_v2yfnbkxg3", 4),
  ];
  const branches = {
    env_fawx2zfrwb: {
      branchName: "feat/editor-shell-scoped-state",
      baseBranch: "origin/dev",
      defaultBranch: "dev",
    },
    env_js44wt6e7t: {
      branchName: "feat/editor-focused-pane",
      baseBranch: "feat/editor-shell-scoped-state",
      defaultBranch: "dev",
    },
    env_armnj6eprc: {
      branchName: "bb/thr_k6ie5dmq9s",
      baseBranch: "feat/editor-focused-pane",
      defaultBranch: "dev",
    },
    env_v2yfnbkxg3: {
      branchName: "feat/editor-input-path-pan",
      baseBranch: "origin/dev",
      defaultBranch: "dev",
    },
  };

  const [group] = groupsFor(threads, branches);

  // The three "in continuity of" threads are one stack; the fourth was cut
  // from trunk and stands apart rather than joining it.
  expect(shape(group!.roots)).toEqual([
    "pan:-",
    "shell:1",
    "pane:2",
    "cli:3",
  ]);
});

test("a thread sitting on trunk does not collect every branch cut from it", () => {
  // The failure the trunk guard exists to prevent: with "origin/dev" and "dev"
  // compared naively, both feature branches would nest under the trunk thread.
  const threads = [
    threadOn("trunk", "env_t", 1),
    threadOn("feature", "env_f", 2),
    threadOn("other", "env_o", 3),
  ];
  const branches = {
    env_t: { branchName: "dev", baseBranch: null, defaultBranch: "dev" },
    env_f: {
      branchName: "feat/one",
      baseBranch: "origin/dev",
      defaultBranch: "dev",
    },
    env_o: {
      branchName: "feat/two",
      baseBranch: "dev",
      defaultBranch: "dev",
    },
  };

  const [group] = groupsFor(threads, branches);

  expect(shape(group!.roots)).toEqual(["other:-", "feature:-", "trunk:-"]);
});

test("a remote-prefixed base still finds the branch it was cut from", () => {
  const threads = [threadOn("base", "env_a", 1), threadOn("top", "env_b", 2)];
  const branches = {
    env_a: {
      branchName: "feat/auth",
      baseBranch: "origin/dev",
      defaultBranch: "dev",
    },
    env_b: {
      branchName: "feat/hash",
      baseBranch: "origin/feat/auth",
      defaultBranch: "dev",
    },
  };

  const [group] = groupsFor(threads, branches);

  expect(shape(group!.roots)).toEqual(["base:1", "top:2"]);
});
