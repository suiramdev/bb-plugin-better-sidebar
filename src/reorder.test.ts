import { expect, test } from "vitest";
import { resolveProjectMove } from "./reorder";

const ORDER = ["a", "b", "c", "d"];

function move(projectId: string, beforeProjectId: string | null) {
  return resolveProjectMove({
    orderedProjectIds: ORDER,
    projectId,
    beforeProjectId,
  });
}

test("dropping onto a row places the project immediately before it", () => {
  expect(move("d", "b")).toEqual({ previousProjectId: "a", nextProjectId: "b" });
  expect(move("a", "c")).toEqual({ previousProjectId: "b", nextProjectId: "c" });
});

test("dropping on the first row moves a project to the top", () => {
  expect(move("c", "a")).toEqual({ previousProjectId: null, nextProjectId: "a" });
});

test("dropping past the end moves a project to the bottom", () => {
  expect(move("b", null)).toEqual({ previousProjectId: "d", nextProjectId: null });
});

test("hidden projects keep their places because neighbors come from the full order", () => {
  // "c" is not on screen; dropping "a" onto "d" must still land between them.
  expect(move("a", "d")).toEqual({ previousProjectId: "c", nextProjectId: "d" });
});

test("a move that changes nothing is refused", () => {
  expect(move("a", "b")).toBeNull();
  expect(move("d", null)).toBeNull();
  expect(move("b", "b")).toBeNull();
});

test("unknown ids are refused rather than guessed", () => {
  expect(move("zz", "a")).toBeNull();
  expect(move("a", "zz")).toBeNull();
  expect(
    resolveProjectMove({ orderedProjectIds: [], projectId: "a", beforeProjectId: null }),
  ).toBeNull();
});
