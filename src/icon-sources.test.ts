import { expect, test } from "vitest";
import { candidatesForRemoteUrl } from "./icon-sources";

test("GitHub remotes try the account avatar before the host favicon", () => {
  expect(candidatesForRemoteUrl("git@github.com:get-bb/bb.git")).toEqual([
    {
      kind: "image",
      url: "https://github.com/get-bb.png?size=128",
      origin: "github-avatar",
    },
    {
      kind: "image",
      url: "https://github.com/favicon.ico",
      origin: "host-favicon",
    },
  ]);
});

test("gitlab.com remotes ask the API for the project avatar, subgroups included", () => {
  const [first] = candidatesForRemoteUrl(
    "https://gitlab.com/group/subgroup/app.git",
  );
  expect(first).toEqual({
    kind: "gitlab-project",
    apiUrl: "https://gitlab.com/api/v4/projects/group%2Fsubgroup%2Fapp",
    origin: "gitlab-avatar",
  });
});

test("a self-hosted forge tries the GitLab project API, then its favicon", () => {
  expect(candidatesForRemoteUrl("git@git.acme.dev:team/app.git")).toEqual([
    {
      kind: "gitlab-project",
      apiUrl: "https://git.acme.dev/api/v4/projects/team%2Fapp",
      origin: "gitlab-avatar",
    },
    {
      kind: "image",
      url: "https://git.acme.dev/favicon.ico",
      origin: "host-favicon",
    },
  ]);
});

test("a project with no usable remote has no candidates", () => {
  expect(candidatesForRemoteUrl(null)).toEqual([]);
  expect(candidatesForRemoteUrl("/Users/me/code/app")).toEqual([]);
});
