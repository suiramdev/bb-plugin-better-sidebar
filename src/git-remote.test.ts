import { describe, expect, test } from "vitest";
import { parseGitRemote, remoteAccount, remoteProjectPath } from "./git-remote";

describe("parseGitRemote", () => {
  test.each([
    ["git@github.com:get-bb/bb.git", "github.com", "get-bb", "bb"],
    ["https://github.com/get-bb/bb", "github.com", "get-bb", "bb"],
    ["https://github.com/get-bb/bb.git/", "github.com", "get-bb", "bb"],
    ["https://www.github.com/get-bb/bb", "github.com", "get-bb", "bb"],
    ["ssh://git@github.com:22/get-bb/bb.git", "github.com", "get-bb", "bb"],
    ["git://codeberg.org/user/thing.git", "codeberg.org", "user", "thing"],
    [
      "https://gitlab.com/group/subgroup/app.git",
      "gitlab.com",
      "group/subgroup",
      "app",
    ],
    ["git@GitHub.com:Acme/Repo.git", "github.com", "Acme", "Repo"],
  ])("parses %s", (input, host, owner, repo) => {
    expect(parseGitRemote(input)).toEqual({ host, owner, repo });
  });

  test.each([
    null,
    "",
    "   ",
    "/Users/me/code/app",
    "file:///Users/me/code/app",
    "git@github.com:bb.git",
    "https://github.com/get-bb",
    "not a url at all",
  ])("rejects %s", (input) => {
    expect(parseGitRemote(input)).toBeNull();
  });
});

test("remoteAccount takes the first owner segment", () => {
  const remote = parseGitRemote("https://gitlab.com/group/subgroup/app.git")!;
  expect(remoteAccount(remote)).toBe("group");
  expect(remoteProjectPath(remote)).toBe("group/subgroup/app");
});
