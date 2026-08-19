import { expect, test } from "vitest";
import { buildGroups, threadSubtitle, threadTitle } from "./grouping";
import { makeProject, makeThread } from "./test-fixtures";

const PROJECTS = [
  makeProject({ id: "proj_1", name: "bb" }),
  makeProject({ id: "proj_2", name: "billing" }),
  makeProject({ id: "proj_personal", name: "Personal", isPersonal: true }),
];

function build(
  threads: Parameters<typeof buildGroups>[0]["threads"],
  overrides: Partial<Parameters<typeof buildGroups>[0]> = {},
) {
  return buildGroups({
    threads,
    projects: PROJECTS,
    searchQuery: "",
    activeProjectId: null,
    ...overrides,
  });
}

test("threads group by project, most recently active group first", () => {
  const groups = build([
    makeThread({ id: "old", projectId: "proj_1", latestAttentionAt: 10 }),
    makeThread({ id: "new", projectId: "proj_2", latestAttentionAt: 99 }),
  ]);
  expect(groups.map((group) => group.projectId)).toEqual(["proj_2", "proj_1"]);
  expect(groups[1]!.projectName).toBe("bb");
});

test("the project in view leads, even with no threads of its own", () => {
  const groups = build(
    [makeThread({ id: "a", projectId: "proj_1", latestAttentionAt: 99 })],
    { activeProjectId: "proj_2" },
  );
  expect(groups.map((group) => group.projectId)).toEqual(["proj_2", "proj_1"]);
  expect(groups[0]!.threadCount).toBe(0);
});

test("pinned threads sit in their own bucket, still by recency", () => {
  const groups = build([
    makeThread({ id: "pin-old", isPinned: true, latestAttentionAt: 5 }),
    makeThread({ id: "pin-new", isPinned: true, latestAttentionAt: 50 }),
    makeThread({ id: "plain", latestAttentionAt: 90 }),
  ]);
  expect(groups[0]!.pinned.map((node) => node.thread.id)).toEqual([
    "pin-new",
    "pin-old",
  ]);
  expect(groups[0]!.roots.map((node) => node.thread.id)).toEqual(["plain"]);
  expect(groups[0]!.threadCount).toBe(3);
});

test("children nest under their parent, oldest first", () => {
  const groups = build([
    makeThread({ id: "parent" }),
    makeThread({ id: "child-b", parentThreadId: "parent", createdAt: 20 }),
    makeThread({ id: "child-a", parentThreadId: "parent", createdAt: 10 }),
  ]);
  expect(groups[0]!.roots).toHaveLength(1);
  expect(groups[0]!.roots[0]!.children.map((node) => node.thread.id)).toEqual([
    "child-a",
    "child-b",
  ]);
  expect(groups[0]!.threadCount).toBe(3);
});

test("an orphan whose parent is gone is listed as a root", () => {
  const groups = build([
    makeThread({ id: "child", parentThreadId: "deleted-parent" }),
  ]);
  expect(groups[0]!.roots.map((node) => node.thread.id)).toEqual(["child"]);
});

test("archived threads never appear", () => {
  const groups = build([makeThread({ id: "gone", isArchived: true })]);
  expect(groups).toEqual([]);
});

test("a search keeps a matching child and its parent as context", () => {
  const groups = build(
    [
      makeThread({ id: "parent", title: "Unrelated" }),
      makeThread({ id: "child", title: "Fix the flaky test", parentThreadId: "parent" }),
      makeThread({ id: "other", title: "Nothing to see" }),
    ],
    { searchQuery: "flaky" },
  );
  const root = groups[0]!.roots[0]!;
  expect(root.thread.id).toBe("parent");
  expect(root.isSearchAncestor).toBe(true);
  expect(root.children[0]!.thread.id).toBe("child");
  expect(root.children[0]!.isSearchAncestor).toBe(false);
  expect(groups[0]!.threadCount).toBe(2);
});

test("a search also matches a branch name or machine", () => {
  const threads = [
    makeThread({
      id: "on-branch",
      title: "Nameless",
      environment: {
        id: "env_1",
        name: null,
        branchName: "feature/passkeys",
        workspaceDisplayKind: "managed-worktree",
      },
    }),
    makeThread({ id: "on-mac", title: "Nameless too", host: { id: "h", name: "studio" } }),
  ];
  expect(build(threads, { searchQuery: "passkeys" })[0]!.threadCount).toBe(1);
  expect(build(threads, { searchQuery: "studio" })[0]!.threadCount).toBe(1);
  expect(build(threads, { searchQuery: "zzz" })).toEqual([]);
});

test("titles fall back, then read as untitled", () => {
  expect(threadTitle(makeThread({ id: "a", title: "Real" }))).toBe("Real");
  expect(
    threadTitle(makeThread({ id: "a", title: null, titleFallback: "First line" })),
  ).toBe("First line");
  expect(
    threadTitle(makeThread({ id: "a", title: "  ", titleFallback: null })),
  ).toBe("Untitled thread");
});

test("the subtitle prefers a branch and falls back to the machine", () => {
  expect(
    threadSubtitle(
      makeThread({
        id: "a",
        environment: {
          id: "env_1",
          name: null,
          branchName: "main",
          workspaceDisplayKind: "other",
        },
        host: { id: "h", name: "studio" },
      }),
    ),
  ).toBe("main");
  expect(threadSubtitle(makeThread({ id: "a", host: { id: "h", name: "studio" } }))).toBe(
    "studio",
  );
  expect(threadSubtitle(makeThread({ id: "a" }))).toBeNull();
});

const ORDER = [
  { id: "proj_1", name: "bb", isPersonal: false, createdAt: 300, position: 2 },
  { id: "proj_2", name: "billing", isPersonal: false, createdAt: 100, position: 0 },
  {
    id: "proj_personal",
    name: "Personal",
    isPersonal: true,
    createdAt: 200,
    position: null,
  },
];

const SPREAD = [
  makeThread({ id: "a", projectId: "proj_1", latestAttentionAt: 10 }),
  makeThread({ id: "b", projectId: "proj_2", latestAttentionAt: 90 }),
  makeThread({ id: "c", projectId: "proj_personal", latestAttentionAt: 50 }),
];

function order(sort: Parameters<typeof buildGroups>[0]["sort"], activeProjectId = null) {
  return buildGroups({
    threads: SPREAD,
    projects: PROJECTS,
    projectOrder: ORDER,
    sort,
    searchQuery: "",
    activeProjectId,
  }).map((group) => group.projectId);
}

test("activity sorts by the most recent attention, with the project in view first", () => {
  expect(order("activity")).toEqual(["proj_2", "proj_personal", "proj_1"]);
  expect(order("activity", "proj_1" as never)).toEqual([
    "proj_1",
    "proj_2",
    "proj_personal",
  ]);
});

test("alphabetical ignores case and the route", () => {
  expect(order("alphabetical")).toEqual(["proj_1", "proj_2", "proj_personal"]);
  expect(order("alphabetical", "proj_2" as never)).toEqual([
    "proj_1",
    "proj_2",
    "proj_personal",
  ]);
});

test("newest and oldest follow the project creation date", () => {
  expect(order("newest")).toEqual(["proj_1", "proj_personal", "proj_2"]);
  expect(order("oldest")).toEqual(["proj_2", "proj_personal", "proj_1"]);
});

test("manual follows bb's own project order and parks the personal project last", () => {
  expect(order("manual")).toEqual(["proj_2", "proj_1", "proj_personal"]);
});

test("groups expose bb's position so a manual drag knows what it is moving", () => {
  const groups = buildGroups({
    threads: SPREAD,
    projects: PROJECTS,
    projectOrder: ORDER,
    sort: "manual",
    searchQuery: "",
    activeProjectId: null,
  });
  expect(groups.map((group) => group.position)).toEqual([0, 2, null]);
});

test("without backend metadata every mode still returns a stable order by name", () => {
  const groups = buildGroups({
    threads: SPREAD,
    projects: PROJECTS,
    sort: "manual",
    searchQuery: "",
    activeProjectId: null,
  });
  expect(groups.map((group) => group.projectName)).toEqual([
    "bb",
    "billing",
    "Personal",
  ]);
});
