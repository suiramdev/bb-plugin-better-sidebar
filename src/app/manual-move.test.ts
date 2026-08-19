import { expect, test } from "vitest";
import { stepMoveTarget } from "./manual-move";

const ORDER = ["a", "b", "c"];

function step(projectId: string, direction: "up" | "down") {
  return stepMoveTarget({ orderedProjectIds: ORDER, projectId, direction });
}

test("moving up lands before the previous project", () => {
  expect(step("b", "up")).toEqual({ beforeProjectId: "a" });
  expect(step("c", "up")).toEqual({ beforeProjectId: "b" });
});

test("moving down lands past the next project", () => {
  expect(step("a", "down")).toEqual({ beforeProjectId: "c" });
  expect(step("b", "down")).toEqual({ beforeProjectId: null });
});

test("the ends of the list have nowhere to go", () => {
  expect(step("a", "up")).toBeNull();
  expect(step("c", "down")).toBeNull();
});

test("a project outside bb's order cannot be stepped", () => {
  expect(step("proj_personal", "up")).toBeNull();
});
