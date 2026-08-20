import { describe, expect, test } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { ThreadNode } from "./grouping";
import { groupWorktrees, groupedThreadIds, worktreeName } from "./worktrees";
import { makeThread } from "./test-fixtures";

type Kind = NonNullable<
  PluginSidebarThread["environment"]
>["workspaceDisplayKind"];

function node(
  id: string,
  environment: {
    id: string;
    name?: string | null;
    branchName?: string | null;
    kind?: Kind;
  } | null,
  overrides: Partial<ThreadNode> = {},
): ThreadNode {
  return {
    thread: makeThread({
      id,
      environment:
        environment === null
          ? null
          : {
              id: environment.id,
              name: environment.name ?? null,
              branchName: environment.branchName ?? null,
              workspaceDisplayKind: environment.kind ?? "managed-worktree",
            },
    }),
    children: [],
    isSearchAncestor: false,
    stackPosition: null,
    ...overrides,
  };
}

/**
 * A readable shape for one sibling list. A thread is its id; a group is its
 * name, its members, and — when it is a stack level — the number it carries.
 */
const kinds = (items: ReturnType<typeof groupWorktrees>): string[] =>
  items.map((item) => {
    if (item.kind === "thread") {
      return item.node.stackPosition === null
        ? item.node.thread.id
        : `${item.node.stackPosition}:${item.node.thread.id}`;
    }
    const position =
      item.group.stackPosition === null ? "" : `${item.group.stackPosition}:`;
    const ids = item.group.nodes.map((n) => n.thread.id).join(",");
    return `${position}[${item.group.name}: ${ids}]`;
  });

describe("groupWorktrees", () => {
  test("folds two threads sharing a worktree under one header", () => {
    const items = groupWorktrees([
      node("a", { id: "env_1", branchName: "feat/x" }),
      node("b", { id: "env_1", branchName: "feat/x" }),
    ]);
    expect(kinds(items)).toEqual(["[feat/x: a,b]"]);
    expect(items[0]!.kind).toBe("worktree");
  });

  test("a lone thread in a worktree stays a plain row", () => {
    // A header over one thread would be a row that says nothing the row below
    // it does not already say.
    const items = groupWorktrees([
      node("a", { id: "env_1", branchName: "feat/x" }),
      node("b", { id: "env_2", branchName: "feat/y" }),
    ]);
    expect(kinds(items)).toEqual(["a", "b"]);
  });

  test("the group takes the place of its first member", () => {
    // Whatever order the caller sorted into survives: the group sits where the
    // most relevant thread in it already sat.
    const items = groupWorktrees([
      node("loose", { id: "env_9", branchName: "solo" }),
      node("a", { id: "env_1", branchName: "feat/x" }),
      node("later", null),
      node("b", { id: "env_1", branchName: "feat/x" }),
    ]);
    expect(kinds(items)).toEqual(["loose", "[feat/x: a,b]", "later"]);
  });

  test("threads outside a worktree never group", () => {
    // `other` is the project checkout itself, so every thread in a project
    // would otherwise collapse into one meaningless pile.
    const items = groupWorktrees([
      node("a", { id: "env_1", kind: "other" }),
      node("b", { id: "env_1", kind: "other" }),
      node("c", null),
      node("d", null),
    ]);
    expect(kinds(items)).toEqual(["a", "b", "c", "d"]);
  });

  test("an unmanaged worktree groups just like a managed one", () => {
    const items = groupWorktrees([
      node("a", { id: "env_1", kind: "unmanaged-worktree", branchName: "wt" }),
      node("b", { id: "env_1", kind: "unmanaged-worktree", branchName: "wt" }),
    ]);
    expect(kinds(items)).toEqual(["[wt: a,b]"]);
  });

  test("a stack level holding several threads becomes one numbered group", () => {
    // A stack is a chain of branches and a branch is a worktree, so a level
    // with two threads in it *is* a worktree group. Left ungrouped it printed
    // the same number and the same branch label on two adjacent rows.
    const items = groupWorktrees([
      node("a", { id: "env_1", branchName: "feat/x" }, { stackPosition: 2 }),
      node("b", { id: "env_1", branchName: "feat/x" }, { stackPosition: 2 }),
    ]);
    expect(kinds(items)).toEqual(["2:[feat/x: a,b]"]);
  });

  test("the level's number moves to the header, off its rows", () => {
    // Stated once, on the thing it is true of.
    const [item] = groupWorktrees([
      node("a", { id: "env_1", branchName: "feat/x" }, { stackPosition: 3 }),
      node("b", { id: "env_1", branchName: "feat/x" }, { stackPosition: 3 }),
    ]);
    expect(item!.kind).toBe("worktree");
    if (item!.kind !== "worktree") return;
    expect(item!.group.stackPosition).toBe(3);
    expect(item!.group.nodes.map((n) => n.stackPosition)).toEqual([null, null]);
  });

  test("two stack levels never merge, even in one worktree", () => {
    // The bucket is the worktree *and* the position, so a header's number is
    // true of every row under it by construction.
    const items = groupWorktrees([
      node("a", { id: "env_1", branchName: "feat/x" }, { stackPosition: 1 }),
      node("b", { id: "env_1", branchName: "feat/x" }, { stackPosition: 2 }),
    ]);
    expect(kinds(items)).toEqual(["1:a", "2:b"]);
  });

  test("a stack anchor sitting beside a real group does not join it", () => {
    const items = groupWorktrees([
      node(
        "stacked",
        { id: "env_1", branchName: "feat/x" },
        { stackPosition: 2 },
      ),
      node("a", { id: "env_2", branchName: "feat/y" }),
      node("b", { id: "env_2", branchName: "feat/y" }),
    ]);
    expect(kinds(items)).toEqual(["2:stacked", "[feat/y: a,b]"]);
  });
});

describe("worktreeName", () => {
  test("prefers the worktree's name, then its branch, then a fallback", () => {
    expect(
      worktreeName(
        node("a", { id: "e", name: "Review copy", branchName: "feat/x" })
          .thread,
      ),
    ).toBe("Review copy");
    expect(
      worktreeName(node("a", { id: "e", branchName: "feat/x" }).thread),
    ).toBe("feat/x");
    expect(worktreeName(node("a", { id: "e" }).thread)).toBe("Worktree");
    // Whitespace is not a name.
    expect(
      worktreeName(node("a", { id: "e", name: "   ", branchName: "b" }).thread),
    ).toBe("b");
  });
});

describe("groupedThreadIds", () => {
  const nodes = [
    node("a", { id: "env_1", branchName: "feat/x" }),
    node("b", { id: "env_1", branchName: "feat/x" }),
    node("loose", null, {
      children: [node("child", null)],
    }),
  ];

  test("reads the list top to bottom, group members included", () => {
    expect(groupedThreadIds(nodes, () => true)).toEqual([
      "a",
      "b",
      "loose",
      "child",
    ]);
  });

  test("a collapsed worktree contributes nothing", () => {
    // A range-click must never reach a row that is not on screen.
    expect(groupedThreadIds(nodes, () => false)).toEqual(["loose", "child"]);
  });

  test("grouping applies to nested siblings too", () => {
    const nested = [
      node("parent", null, {
        children: [
          node("x", { id: "env_2", branchName: "deep" }),
          node("y", { id: "env_2", branchName: "deep" }),
        ],
      }),
    ];
    expect(groupedThreadIds(nested, () => true)).toEqual(["parent", "x", "y"]);
    expect(groupedThreadIds(nested, () => false)).toEqual(["parent"]);
  });
});
