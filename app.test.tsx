// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeProject, makeThread } from "./src/app/test-fixtures";

const ICON = "data:image/png;base64,AQIDBA==";

const FEATURES = {
  projectIcons: true,
  tabFavicon: true,
  showBranch: true,
  showPullRequests: false,
};

function sidebarRpc(overrides: Record<string, unknown> = {}) {
  return {
    sidebar: () => ({
      features: FEATURES,
      icons: { proj_1: icon(), proj_2: icon({ dataUrl: null, mode: "none" }) },
    }),
    ...overrides,
  };
}

function icon(overrides: Record<string, unknown> = {}) {
  return {
    mode: "auto",
    dataUrl: ICON,
    origin: "github-avatar",
    sourceUrl: null,
    error: null,
    fetchedAt: 1,
    isResolving: false,
    ...overrides,
  };
}

const THREADS = [
  makeThread({
    id: "thr_root",
    title: "Fix the flaky test",
    projectId: "proj_1",
    latestAttentionAt: 50,
    environment: {
      id: "env_1",
      name: null,
      branchName: "fix/flake",
      workspaceDisplayKind: "managed-worktree",
    },
  }),
  makeThread({
    id: "thr_child",
    title: "Investigate the retry",
    projectId: "proj_1",
    parentThreadId: "thr_root",
  }),
  makeThread({
    id: "thr_other",
    title: "Ship the invoice export",
    projectId: "proj_2",
    latestAttentionAt: 10,
  }),
];

const SIDEBAR_THREADS = {
  threads: THREADS,
  projects: [
    makeProject({ id: "proj_1", name: "bb" }),
    makeProject({ id: "proj_2", name: "billing" }),
  ],
};

// Slot queries are document-scoped, so every mount is unmounted between tests.
const mounted: { lifecycle: { unmount: () => void } }[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.lifecycle.unmount();
});

async function mountList(
  props: Partial<Parameters<typeof renderSlot>[1]> = {},
  options: Record<string, unknown> = {},
) {
  const app = await loadPluginApp(() => import("./app"));
  const registration = app.threadLists[0]!;
  const slot = renderSlot(
    registration,
    {
      activeThreadId: null,
      activeProjectId: null,
      isCompactViewport: false,
      onNavigate: () => {},
      searchQuery: "",
      ...props,
    },
    { rpc: sidebarRpc(), sidebarThreads: SIDEBAR_THREADS, ...options },
  );
  mounted.push(slot);
  return slot;
}

test("the plugin registers a thread list, a settings section, and the favicon script", async () => {
  const app = await loadPluginApp(() => import("./app"));
  expect(app.threadLists.map((entry) => entry.id)).toEqual(["projects"]);
  expect(app.settingsSections.map((entry) => entry.id)).toEqual(["project-icons"]);
  expect(app.contentScripts.map((entry) => entry.id)).toEqual(["tab-favicon"]);
});

test("threads are grouped under their project, children nested", async () => {
  const slot = await mountList();
  await slot.findByText("bb");
  expect(slot.getByText("billing")).toBeTruthy();
  const child = await slot.findByText("Investigate the retry");
  const root = slot.getByText("Fix the flaky test");
  // The child row is indented relative to its parent row.
  const indentOf = (element: HTMLElement): number =>
    Number(
      /margin-left:\s*(\d+)px/.exec(
        element.closest("[style]")?.getAttribute("style") ?? "",
      )?.[1] ?? 0,
    );
  expect(indentOf(child)).toBeGreaterThan(indentOf(root));
});

test("each row carries the attributes bb's thread shortcuts look for", async () => {
  const slot = await mountList();
  const row = await slot.findByLabelText("Fix the flaky test");
  expect(row.getAttribute("data-sidebar-thread-id")).toBe("thr_root");
  expect(row.hasAttribute("data-sidebar-thread-shortcut-target")).toBe(true);
});

test("opening a row routes through the host action and clears search mode", async () => {
  let navigated = 0;
  const slot = await mountList({ onNavigate: () => (navigated += 1) });
  const row = await slot.findByLabelText("Ship the invoice export");
  row.click();
  expect(slot.inspection.sidebarActionCalls).toContainEqual(
    expect.objectContaining({ method: "open", threadId: "thr_other" }),
  );
  expect(navigated).toBe(1);
});

test("a project icon is drawn for a project that has one, a monogram for one that does not", async () => {
  const slot = await mountList();
  await slot.findByText("bb");
  const images = slot.container.querySelectorAll("img");
  expect([...images].map((image) => image.getAttribute("src"))).toEqual([ICON]);
  // "billing" has no icon, so its header shows the monogram tile instead.
  expect(slot.getByText("B")).toBeTruthy();
});

test("the branch is shown, and hidden when the feature is off", async () => {
  const shown = await mountList();
  expect(await shown.findByText("fix/flake")).toBeTruthy();
  mounted.pop()!.lifecycle.unmount();

  const hidden = await mountList(
    {},
    {
      rpc: {
        sidebar: () => ({
          features: { ...FEATURES, showBranch: false },
          icons: {},
        }),
      },
    },
  );
  await hidden.findByText("bb");
  expect(hidden.queryByText("fix/flake")).toBeNull();
});

test("the host's search query filters the list and keeps a match's parent", async () => {
  const slot = await mountList({ searchQuery: "retry" });
  expect(await slot.findByText("Investigate the retry")).toBeTruthy();
  expect(slot.getByText("Fix the flaky test")).toBeTruthy();
  expect(slot.queryByText("Ship the invoice export")).toBeNull();
});

test("a project the sidebar shows is what the icons call asks for", async () => {
  const slot = await mountList();
  await slot.findByText("bb");
  expect(slot.inspection.rpcCalls).toContainEqual(
    expect.objectContaining({
      method: "sidebar",
      input: { projectIds: ["proj_1", "proj_2"] },
    }),
  );
});
