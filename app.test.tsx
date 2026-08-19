// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeProject, makeThread } from "./src/app/test-fixtures";

const ICON = "data:image/png;base64,AQIDBA==";

const FEATURES = {
  projectIcons: true,
  tabFavicon: true,
  showBranch: true,
  showPullRequests: false,
  stackedThreads: false,
};

const PROJECT_ORDER = [
  { id: "proj_1", name: "bb", isPersonal: false, createdAt: 200, position: 0 },
  {
    id: "proj_2",
    name: "billing",
    isPersonal: false,
    createdAt: 100,
    position: 1,
  },
];

function sidebarRpc(overrides: Record<string, unknown> = {}) {
  return {
    sidebar: () => ({
      features: FEATURES,
      preferences: { projectSort: "activity" },
      projects: PROJECT_ORDER,
      icons: { proj_1: icon(), proj_2: icon({ dataUrl: null, mode: "none" }) },
    }),
    // The harness types every handler as `(input: unknown) => unknown`; this
    // one just echoes what it was sent back as the saved preferences.
    setProjectSort: (input: unknown) => ({ preferences: input }),
    moveProject: () => ({ projects: PROJECT_ORDER }),
    deleteProject: () => ({ projects: PROJECT_ORDER.slice(0, 1) }),
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

/**
 * jsdom ships no DragEvent, and `fireEvent.drop` drops the pointer position with
 * it — which is exactly what decides whether a drop lands above or below a
 * header. Dispatch a MouseEvent under the drag event's name instead.
 */
function fireDrag(
  element: HTMLElement,
  type: "dragstart" | "dragover" | "drop",
  { clientY = 0, dataTransfer }: { clientY?: number; dataTransfer: unknown },
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY,
  });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  // Through fireEvent, so React's state updates flush inside act().
  fireEvent(element, event);
}

function fakeDataTransfer() {
  return {
    data: {} as Record<string, string>,
    effectAllowed: "",
    dropEffect: "",
    setData(type: string, value: string) {
      this.data[type] = value;
    },
    getData(type: string) {
      return this.data[type] ?? "";
    },
  };
}

function stubBounds(element: HTMLElement): void {
  element.getBoundingClientRect = () =>
    ({
      top: 100,
      height: 20,
      bottom: 120,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
}

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
      // This sidebar replaces BB's list outright and never delegates back to
      // it, so the prop only has to satisfy the contract.
      experimental_Original: () => null,
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
  expect(app.settingsSections.map((entry) => entry.id)).toEqual([
    "project-icons",
  ]);
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
      rpc: sidebarRpc({
        sidebar: () => ({
          features: { ...FEATURES, showBranch: false },
          preferences: { projectSort: "activity" },
          projects: PROJECT_ORDER,
          icons: {},
        }),
      }),
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

test("the settings section lists projects and opens the icon editor", async () => {
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(
    app.settingsSections[0]!,
    {},
    {
      rpc: {
        overview: () => ({
          features: FEATURES,
          preferences: { projectSort: "activity" },
          projects: [
            {
              id: "proj_1",
              name: "bb",
              isPersonal: false,
              gitRemoteUrl: "git@github.com:get-bb/bb.git",
              icon: icon(),
            },
            {
              id: "proj_2",
              name: "billing",
              isPersonal: false,
              gitRemoteUrl: null,
              icon: icon({ dataUrl: null, origin: null }),
            },
          ],
        }),
        setIcon: () => ({ icon: icon({ mode: "none", dataUrl: null }) }),
      },
    },
  );
  mounted.push(slot);

  expect(await slot.findByText("bb")).toBeTruthy();
  expect(slot.getByText("No git remote")).toBeTruthy();

  slot.getAllByRole("button", { name: "Change" })[0]!.click();
  expect(
    await slot.findByRole("radio", { name: "From the repository" }),
  ).toBeTruthy();

  // "No icon" needs nothing more from the user, so it applies immediately.
  slot.getByRole("radio", { name: "No icon" }).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(slot.inspection.rpcCalls).toContainEqual(
    expect.objectContaining({
      method: "setIcon",
      input: { projectId: "proj_1", mode: "none" },
    }),
  );
});

test("the sort menu offers every mode and stores the choice", async () => {
  const slot = await mountList();
  const trigger = await slot.findByLabelText("Sort projects: Last activity");
  // Radix opens on pointerdown, not click.
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  const alphabetical = await slot.findByRole("menuitemradio", {
    name: "Alphabetical",
  });
  expect(
    slot.getAllByRole("menuitemradio").map((item) => item.textContent),
  ).toEqual([
    "Last activity",
    "Manual (drag to reorder)",
    "Alphabetical",
    "Newest project first",
    "Oldest project first",
  ]);

  alphabetical.click();
  await slot.findByLabelText("Sort projects: Alphabetical");
  expect(slot.inspection.rpcCalls).toContainEqual(
    expect.objectContaining({
      method: "setProjectSort",
      input: { projectSort: "alphabetical" },
    }),
  );
});

test("the chosen sort mode orders the project groups", async () => {
  // "bb" holds the most recent thread and is the newer project, so activity
  // leads with it; "oldest" turns the list around.
  const activity = await mountList();
  await activity.findByText("billing");
  expect(headerNames(activity)[0]).toContain("bb");
  mounted.pop()!.lifecycle.unmount();

  const oldest = await mountList(
    {},
    {
      rpc: sidebarRpc({
        sidebar: () => ({
          features: FEATURES,
          preferences: { projectSort: "oldest" },
          projects: PROJECT_ORDER,
          icons: {},
        }),
      }),
    },
  );
  await oldest.findByText("bb");
  expect(headerNames(oldest)[0]).toContain("billing");
});

function headerNames(slot: {
  getAllByRole: (role: string, options?: object) => HTMLElement[];
}): string[] {
  return slot
    .getAllByRole("button", { expanded: true })
    .map((button) => button.textContent ?? "");
}

test("manual mode makes project headers draggable and moves them on drop", async () => {
  const slot = await mountList(
    {},
    {
      rpc: sidebarRpc({
        sidebar: () => ({
          features: FEATURES,
          preferences: { projectSort: "manual" },
          projects: PROJECT_ORDER,
          icons: {},
        }),
      }),
    },
  );
  const headers = await slot.findAllByRole("button", { expanded: true });
  const [bb, billing] = headers;
  expect(bb!.getAttribute("draggable")).toBe("true");
  stubBounds(bb!);

  // Drop "billing" on the top half of "bb": it lands immediately before it.
  const dataTransfer = fakeDataTransfer();
  fireDrag(billing!, "dragstart", { dataTransfer });
  fireDrag(bb!, "dragover", { dataTransfer, clientY: 104 });
  fireDrag(bb!, "drop", { dataTransfer, clientY: 104 });

  await vi.waitFor(() =>
    expect(slot.inspection.rpcCalls).toContainEqual(
      expect.objectContaining({
        method: "moveProject",
        input: { projectId: "proj_2", beforeProjectId: "proj_1" },
      }),
    ),
  );
});

test("dropping below the last header sends a project to the end", async () => {
  const slot = await mountList(
    {},
    {
      rpc: sidebarRpc({
        sidebar: () => ({
          features: FEATURES,
          preferences: { projectSort: "manual" },
          projects: PROJECT_ORDER,
          icons: {},
        }),
      }),
    },
  );
  const headers = await slot.findAllByRole("button", { expanded: true });
  const last = headers[headers.length - 1]!;
  stubBounds(last);

  const dataTransfer = fakeDataTransfer();
  fireDrag(headers[0]!, "dragstart", { dataTransfer });
  fireDrag(last, "drop", { dataTransfer, clientY: 118 });

  await vi.waitFor(() =>
    expect(slot.inspection.rpcCalls).toContainEqual(
      expect.objectContaining({
        method: "moveProject",
        input: { projectId: "proj_1", beforeProjectId: null },
      }),
    ),
  );
});

test("a project is not draggable outside manual mode", async () => {
  const slot = await mountList();
  const headers = await slot.findAllByRole("button", { expanded: true });
  expect(headers[0]!.getAttribute("draggable")).toBe("false");
});

/** The same fixture plus "docs", a project nobody has started a thread in. */
const WITH_QUIET_PROJECT = {
  threads: THREADS,
  projects: [
    ...SIDEBAR_THREADS.projects,
    makeProject({ id: "proj_3", name: "docs" }),
  ],
};

test("a project with no threads is still listed, dimmed and below the rest", async () => {
  const slot = await mountList({}, { sidebarThreads: WITH_QUIET_PROJECT });
  const quiet = await slot.findByLabelText("docs");

  // Last in the list, under a heading that says why it is set apart.
  const sections = [...slot.container.querySelectorAll("section")];
  expect(sections[sections.length - 1]).toBe(quiet);
  const heading = slot.getByRole("heading", { name: "No threads yet" });
  expect(
    heading.compareDocumentPosition(quiet) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  // Dimmed, and dimmed only here: the projects with threads stay at full
  // strength.
  expect(quiet.querySelector(".opacity-55")).toBeTruthy();
  expect(slot.getByLabelText("bb").querySelector(".opacity-55")).toBeNull();
});

test("the quiet group collapses, and stays collapsed on the next mount", async () => {
  localStorage.clear();
  const slot = await mountList({}, { sidebarThreads: WITH_QUIET_PROJECT });
  await slot.findByLabelText("docs");

  // It counts what it hides, so a collapsed group is not a mystery.
  const toggle = slot.getByRole("button", { name: /No threads yet/ });
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(toggle.textContent).toContain("1");

  fireEvent.click(toggle);
  await vi.waitFor(() => expect(slot.queryByLabelText("docs")).toBeNull());
  // The heading survives its own collapse; the projects with threads do too.
  expect(
    slot
      .getByRole("button", { name: /No threads yet/ })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(slot.getByLabelText("bb")).toBeTruthy();

  mounted.pop()!.lifecycle.unmount();
  const remounted = await mountList({}, { sidebarThreads: WITH_QUIET_PROJECT });
  await remounted.findByText("bb");
  expect(remounted.queryByLabelText("docs")).toBeNull();
  localStorage.clear();
});
test("every project carries an actions button that opens the project menu", async () => {
  const slot = await mountList({}, { sidebarThreads: WITH_QUIET_PROJECT });
  await slot.findByText("bb");
  expect(
    slot
      .getAllByRole("button", { name: /^Actions for / })
      .map((button) => button.getAttribute("aria-label")),
  ).toEqual(["Actions for bb", "Actions for billing", "Actions for docs"]);

  // Radix opens on pointerdown, not click.
  fireEvent.pointerDown(slot.getByLabelText("Actions for docs"), {
    button: 0,
    ctrlKey: false,
  });
  const newThread = await slot.findByRole("menuitem", {
    name: "New thread here",
  });
  expect(
    slot.getByRole("menuitem", { name: "Set project icon…" }),
  ).toBeTruthy();

  newThread.click();
  expect(slot.inspection.sidebarActionCalls).toContainEqual(
    expect.objectContaining({
      method: "openNewThread",
      options: { projectId: "proj_3" },
    }),
  );
});

/** Opens a project's actions menu and picks "Delete project…". */
async function openDeleteFlow(slot: Awaited<ReturnType<typeof mountList>>) {
  await slot.findByText("billing");
  // Radix opens on pointerdown, not click.
  fireEvent.pointerDown(slot.getByLabelText("Actions for billing"), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(
    await slot.findByRole("menuitem", { name: "Delete project…" }),
  );
}

test("deleting a project takes two confirmations before anything is deleted", async () => {
  const slot = await mountList();
  await openDeleteFlow(slot);

  // First confirmation: what will happen, and what will not.
  expect(await slot.findByText("Delete billing?")).toBeTruthy();
  expect(slot.getByText(/Its thread will be deleted with it/)).toBeTruthy();
  expect(slot.getByText(/files on disk are not touched/)).toBeTruthy();
  // No destructive button yet, and nothing has been asked of the backend.
  expect(slot.queryByRole("button", { name: "Delete billing" })).toBeNull();
  expect(deleteCalls(slot)).toEqual([]);

  // Second confirmation: the consequence, and only now the destructive button.
  fireEvent.click(slot.getByRole("button", { name: "Continue" }));
  expect(await slot.findByText("This cannot be undone")).toBeTruthy();
  expect(deleteCalls(slot)).toEqual([]);

  fireEvent.click(slot.getByRole("button", { name: "Delete billing" }));
  await vi.waitFor(() =>
    expect(deleteCalls(slot)).toEqual([{ projectId: "proj_2" }]),
  );
});

test("backing out of either confirmation deletes nothing", async () => {
  const slot = await mountList();
  await openDeleteFlow(slot);

  // Out of the first screen.
  fireEvent.click(slot.getByRole("button", { name: "Cancel" }));
  await vi.waitFor(() =>
    expect(slot.queryByText("Delete billing?")).toBeNull(),
  );

  // And back out of the second, which returns to the first rather than closing.
  await openDeleteFlow(slot);
  fireEvent.click(slot.getByRole("button", { name: "Continue" }));
  fireEvent.click(await slot.findByRole("button", { name: "Back" }));
  expect(await slot.findByText("Delete billing?")).toBeTruthy();
  expect(deleteCalls(slot)).toEqual([]);
});

test("the personal project is not offered for deletion", async () => {
  const slot = await mountList(
    {},
    {
      sidebarThreads: {
        threads: THREADS,
        projects: [
          ...SIDEBAR_THREADS.projects,
          makeProject({ id: "proj_me", name: "Personal", isPersonal: true }),
        ],
      },
    },
  );
  await slot.findByText("Personal");
  fireEvent.pointerDown(slot.getByLabelText("Actions for Personal"), {
    button: 0,
    ctrlKey: false,
  });
  expect(
    await slot.findByRole("menuitem", { name: "New thread here" }),
  ).toBeTruthy();
  expect(slot.queryByRole("menuitem", { name: "Delete project…" })).toBeNull();
});

function deleteCalls(slot: {
  inspection: { rpcCalls: { method: string; input: unknown }[] };
}) {
  return slot.inspection.rpcCalls
    .filter((call) => call.method === "deleteProject")
    .map((call) => call.input);
}

/**
 * Stacked threads: three threads whose branches are cut from one another, which
 * only `baseBranch` reveals. `thr_b` is deliberately parented to nothing and
 * `thr_c` is parented to `thr_a`, so a pass that keyed off `parentThreadId`
 * could not produce this order.
 */
const STACK_THREADS = {
  threads: [
    makeThread({
      id: "thr_a",
      title: "Add auth endpoints",
      projectId: "proj_1",
      createdAt: 1,
      latestAttentionAt: 50,
      environment: {
        id: "env_a",
        name: null,
        branchName: "feat/auth",
        workspaceDisplayKind: "managed-worktree",
      },
    }),
    makeThread({
      id: "thr_b",
      title: "Hash passwords",
      projectId: "proj_1",
      createdAt: 2,
      environment: {
        id: "env_b",
        name: null,
        branchName: "feat/hash",
        workspaceDisplayKind: "managed-worktree",
      },
    }),
    makeThread({
      id: "thr_c",
      title: "Add refresh tokens",
      projectId: "proj_1",
      createdAt: 3,
      parentThreadId: "thr_a",
      environment: {
        id: "env_c",
        name: null,
        branchName: "feat/refresh",
        workspaceDisplayKind: "managed-worktree",
      },
    }),
  ],
  projects: [makeProject({ id: "proj_1", name: "bb" })],
};

const STACK_BRANCHES = {
  env_a: {
    branchName: "feat/auth",
    baseBranch: "main",
    defaultBranch: "main",
  },
  env_b: {
    branchName: "feat/hash",
    baseBranch: "feat/auth",
    defaultBranch: "main",
  },
  env_c: {
    branchName: "feat/refresh",
    baseBranch: "feat/hash",
    defaultBranch: "main",
  },
};

test("stacked threads stay off until the feature is on, and cost no lookup", async () => {
  const slot = await mountList(
    {},
    { sidebarThreads: STACK_THREADS, rpc: sidebarRpc() },
  );
  await slot.findByLabelText("Add auth endpoints");

  // Nothing is numbered, and the host was never asked about an environment.
  expect(slot.queryByLabelText(/in stack/)).toBeNull();
  expect(
    slot.inspection.rpcCalls.filter((call) => call.method === "stacks"),
  ).toEqual([]);
});

test("a stack reads as an ordered list nested one layer under its parent", async () => {
  const slot = await mountList(
    {},
    {
      sidebarThreads: STACK_THREADS,
      rpc: sidebarRpc({
        sidebar: () => ({
          features: { ...FEATURES, stackedThreads: true },
          preferences: { projectSort: "activity" },
          projects: PROJECT_ORDER,
          icons: {},
        }),
        stacks: () => ({ branches: STACK_BRANCHES }),
      }),
    },
  );

  // The bottom of the stack keeps a plain label; the rest are numbered in
  // based-on order, whatever their parentThreadId says.
  await slot.findByLabelText("Add auth endpoints");
  await slot.findByLabelText("Hash passwords, 2nd in stack");
  await slot.findByLabelText("Add refresh tokens, 3rd in stack");

  // One layer deep: every stacked row shares the first indent step.
  const rows = ["Hash passwords, 2nd in stack", "Add refresh tokens, 3rd in stack"];
  const indents = rows.map((label) => {
    const row = slot.getByLabelText(label).closest("div[style]");
    return (row as HTMLElement).style.marginLeft;
  });
  expect(new Set(indents)).toEqual(new Set(["14px"]));
});

test("only the environments on screen are asked about, once each", async () => {
  const slot = await mountList(
    {},
    {
      sidebarThreads: STACK_THREADS,
      rpc: sidebarRpc({
        sidebar: () => ({
          features: { ...FEATURES, stackedThreads: true },
          preferences: { projectSort: "activity" },
          projects: PROJECT_ORDER,
          icons: {},
        }),
        stacks: () => ({ branches: STACK_BRANCHES }),
      }),
    },
  );
  await slot.findByLabelText("Hash passwords, 2nd in stack");

  expect(
    slot.inspection.rpcCalls
      .filter((call) => call.method === "stacks")
      .map((call) => call.input),
  ).toEqual([{ environmentIds: ["env_a", "env_b", "env_c"] }]);
});
