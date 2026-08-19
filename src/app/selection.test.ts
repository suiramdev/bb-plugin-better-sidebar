import { expect, test } from "vitest";
import { buildGroups, type ProjectGroup } from "./grouping";
import {
  EMPTY_SELECTION,
  extendSelection,
  orderedThreadIds,
  pruneSelection,
  rangeBetween,
  selectOnly,
  toggleSelection,
} from "./selection";
import { makeProject, makeThread } from "./test-fixtures";

const PROJECTS = [
  makeProject({ id: "proj_1", name: "bb" }),
  makeProject({ id: "proj_2", name: "billing" }),
];

/** Two projects, one of them with a child thread, in drawn order. */
function groups(): ProjectGroup[] {
  return buildGroups({
    threads: [
      makeThread({ id: "a", projectId: "proj_1", latestAttentionAt: 40 }),
      makeThread({ id: "b", projectId: "proj_1", latestAttentionAt: 30 }),
      makeThread({
        id: "b-child",
        projectId: "proj_1",
        parentThreadId: "b",
        latestAttentionAt: 20,
      }),
      makeThread({ id: "c", projectId: "proj_2", latestAttentionAt: 10 }),
    ],
    projects: PROJECTS,
    searchQuery: "",
    activeProjectId: null,
  });
}

const ALL = () => orderedThreadIds(groups(), () => true);

test("the order follows the drawn list, children under their parent", () => {
  expect(ALL()).toEqual(["a", "b", "b-child", "c"]);
});

test("a pinned thread leads its project", () => {
  const built = buildGroups({
    threads: [
      makeThread({ id: "a", projectId: "proj_1", latestAttentionAt: 40 }),
      makeThread({
        id: "pinned",
        projectId: "proj_1",
        isPinned: true,
        latestAttentionAt: 1,
      }),
    ],
    projects: PROJECTS,
    searchQuery: "",
    activeProjectId: null,
  });
  expect(orderedThreadIds(built, () => true)).toEqual(["pinned", "a"]);
});

test("a collapsed project contributes no rows to select", () => {
  expect(orderedThreadIds(groups(), (id) => id !== "proj_1")).toEqual(["c"]);
});

test("a range covers both ends whichever way it is drawn", () => {
  expect(rangeBetween(ALL(), "b", "b-child")).toEqual(["b", "b-child"]);
  expect(rangeBetween(ALL(), "c", "a")).toEqual(["a", "b", "b-child", "c"]);
});

test("a range against a row that is gone selects nothing", () => {
  expect(rangeBetween(ALL(), "a", "vanished")).toEqual([]);
});

test("shift-clicking with no anchor picks the one row", () => {
  const next = extendSelection(EMPTY_SELECTION, ALL(), "b");
  expect([...next.ids]).toEqual(["b"]);
  expect(next.anchorId).toBe("b");
});

test("the anchor holds, so a range shrinks as well as grows", () => {
  const first = extendSelection(selectOnly("a"), ALL(), "c");
  expect([...first.ids]).toEqual(["a", "b", "b-child", "c"]);
  const shrunk = extendSelection(first, ALL(), "b");
  expect([...shrunk.ids]).toEqual(["a", "b"]);
  expect(shrunk.anchorId).toBe("a");
});

test("a range crosses project boundaries", () => {
  const next = extendSelection(selectOnly("b-child"), ALL(), "c");
  expect([...next.ids]).toEqual(["b-child", "c"]);
});

test("alt-click adds, removes, and re-anchors", () => {
  const added = toggleSelection(selectOnly("a"), "c");
  expect([...added.ids]).toEqual(["a", "c"]);
  expect(added.anchorId).toBe("c");

  const removed = toggleSelection(added, "c");
  expect([...removed.ids]).toEqual(["a"]);
  // The anchor went with the row it was on.
  expect(removed.anchorId).toBeNull();
});

test("rows that leave the list leave the selection", () => {
  const selection = extendSelection(selectOnly("a"), ALL(), "c");
  const pruned = pruneSelection(selection, ["a", "c"]);
  expect([...pruned.ids]).toEqual(["a", "c"]);
  expect(pruned.anchorId).toBe("a");
});

test("pruning away the anchor clears it", () => {
  const pruned = pruneSelection(selectOnly("a"), ["c"]);
  expect([...pruned.ids]).toEqual([]);
  expect(pruned.anchorId).toBeNull();
});

test("pruning nothing returns the same object", () => {
  const selection = selectOnly("a");
  expect(pruneSelection(selection, ALL())).toBe(selection);
});
