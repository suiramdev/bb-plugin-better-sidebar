import { expect, test, vi } from "vitest";
import { findProject, runCli, type CliDeps, type CliProject } from "./cli";
import type { PublicIcon } from "./contract";
import type { ProjectSort } from "./preferences";

const PROJECTS: CliProject[] = [
  { id: "proj_1", name: "bb", gitRemoteUrl: "git@github.com:get-bb/bb.git" },
  { id: "proj_2", name: "billing-api", gitRemoteUrl: null },
  { id: "proj_3", name: "billing-web", gitRemoteUrl: null },
];

function icon(overrides: Partial<PublicIcon> = {}): PublicIcon {
  return {
    mode: "auto",
    dataUrl: "data:image/png;base64,AQIDBA==",
    origin: "github-avatar",
    sourceUrl: null,
    error: null,
    fetchedAt: 1,
    isResolving: false,
    ...overrides,
  };
}

let storedSort: ProjectSort = "activity";

function deps(overrides: Partial<CliDeps["icons"]> = {}): CliDeps {
  return {
    listProjects: async () => PROJECTS,
    readPreferences: async () => ({ projectSort: storedSort }),
    writeProjectSort: async (projectSort) => {
      storedSort = projectSort;
      return { projectSort };
    },
    icons: {
      setIcon: vi.fn(async () => icon()),
      refresh: vi.fn(async () => icon()),
      iconsFor: vi.fn(async (ids: readonly string[]) =>
        Object.fromEntries(ids.map((id) => [id, icon()])),
      ),
      ...overrides,
    },
  };
}

test("no arguments prints usage and fails", async () => {
  const result = await runCli([], deps());
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("bb better-sidebar list");
});

test("list reports every project's mode, origin, and remote", async () => {
  const result = await runCli(["list"], deps());
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("bb  (proj_1)  auto: icon from github-avatar");
  expect(result.stdout).toContain("billing-api  (proj_2)");
  expect(result.stdout).toContain("no remote");
});

test("set --url passes the URL through", async () => {
  const setIcon = vi.fn(async () => icon({ mode: "url", origin: "url" }));
  const result = await runCli(
    ["set", "proj_1", "--url", "https://example.test/logo.png"],
    deps({ setIcon }),
  );
  expect(result.exitCode).toBe(0);
  expect(setIcon).toHaveBeenCalledWith({
    projectId: "proj_1",
    mode: "url",
    url: "https://example.test/logo.png",
  });
});

test("a failed set exits non-zero with the reason on stderr", async () => {
  const result = await runCli(
    ["set", "proj_1", "--url", "https://example.test/logo.png"],
    deps({ setIcon: async () => icon({ dataUrl: null, error: "404" }) }),
  );
  expect(result).toMatchObject({ exitCode: 1, stderr: "404" });
});

test("a project can be named instead of identified", async () => {
  const refresh = vi.fn(async () => icon());
  await runCli(["refresh", "bb"], deps({ refresh }));
  expect(refresh).toHaveBeenCalledWith("proj_1");
});

test("an ambiguous name is refused, listing the matches", async () => {
  const result = await runCli(["set", "billing", "--none"], deps());
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("matches 2 projects");
});

test("mode flags are mutually exclusive and required", async () => {
  await expect(runCli(["set", "proj_1"], deps())).resolves.toMatchObject({
    exitCode: 1,
    stderr: expect.stringContaining("Choose --auto, --url, or --none."),
  });
  await expect(
    runCli(["set", "proj_1", "--auto", "--none"], deps()),
  ).resolves.toMatchObject({ exitCode: 1 });
  await expect(
    runCli(["set", "proj_1", "--url"], deps()),
  ).resolves.toMatchObject({
    exitCode: 1,
    stderr: expect.stringContaining("--url needs a value."),
  });
});

test("sort with no argument shows the modes and marks the active one", async () => {
  storedSort = "alphabetical";
  const result = await runCli(["sort"], deps());
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("* alphabetical");
  expect(result.stdout).toContain("  manual");
});

test("sort sets a mode and refuses an unknown one", async () => {
  storedSort = "activity";
  await expect(runCli(["sort", "manual"], deps())).resolves.toMatchObject({
    exitCode: 0,
    stdout: "Projects sort by Manual (drag to reorder).",
  });
  expect(storedSort).toBe("manual");

  await expect(runCli(["sort", "sideways"], deps())).resolves.toMatchObject({
    exitCode: 1,
    stderr: expect.stringContaining("Unknown sort \"sideways\""),
  });
  expect(storedSort).toBe("manual");
});

test("an unknown command fails with usage", async () => {
  const result = await runCli(["frobnicate"], deps());
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('Unknown command "frobnicate"');
});

test("findProject prefers an exact id, then an exact name, then a prefix", () => {
  expect(findProject(PROJECTS, "proj_2")).toMatchObject({
    project: { id: "proj_2" },
  });
  expect(findProject(PROJECTS, "billing-web")).toMatchObject({
    project: { id: "proj_3" },
  });
  expect(findProject(PROJECTS, "billing-w")).toMatchObject({
    project: { id: "proj_3" },
  });
  expect(findProject(PROJECTS, "nope")).toEqual({
    ok: false,
    error: 'No project matches "nope".',
  });
});
