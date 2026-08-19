import { expect, test } from "vitest";
import { projectNameFromPath } from "./project-name";

test("a project is named after the folder that was picked", () => {
  expect(projectNameFromPath("/Users/me/projects/bb-plugin")).toBe("bb-plugin");
  expect(projectNameFromPath("C:\\Users\\me\\projects\\bb-plugin")).toBe(
    "bb-plugin",
  );
});

test("a trailing separator does not empty the name", () => {
  expect(projectNameFromPath("/Users/me/projects/bb-plugin/")).toBe(
    "bb-plugin",
  );
});

test("a path with no segment falls back to the path itself", () => {
  expect(projectNameFromPath("/")).toBe("/");
});
