import { beforeEach, expect, test, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

const PIXEL_DATA_URL = "data:image/png;base64,AQIDBA==";

function imageResponse() {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "image/png" }),
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    json: async () => null,
  } as unknown as Response;
}

const PROJECTS = [
  {
    id: "proj_1",
    kind: "standard" as const,
    name: "bb",
    gitRemoteUrl: "git@github.com:get-bb/bb.git",
  },
  {
    id: "proj_personal",
    kind: "personal" as const,
    name: "Personal",
    gitRemoteUrl: null,
  },
];

function host(settings: Record<string, unknown> = {}) {
  return createFakePluginHost({
    pluginId: "better-sidebar",
    settings,
    sdk: {
      projects: { list: async () => PROJECTS },
    },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => imageResponse()));
});

test("overview lists every project, personal included, with its icon", async () => {
  const { bb, harness } = host();
  await plugin(bb);
  const result = (await harness.behavior.callRpc("overview", null)) as {
    features: Record<string, boolean>;
    projects: { id: string; isPersonal: boolean; icon: { mode: string } }[];
  };
  expect(result.features).toEqual({
    projectIcons: true,
    tabFavicon: true,
    showBranch: true,
    showPullRequests: false,
  });
  expect(result.projects.map((project) => project.id)).toEqual([
    "proj_1",
    "proj_personal",
  ]);
  expect(result.projects[1]!.isPersonal).toBe(true);
});

test("the sidebar call resolves missing icons in the background and signals clients", async () => {
  const { bb, harness } = host();
  await plugin(bb);
  await harness.behavior.callRpc("sidebar", { projectIds: ["proj_1"] });
  await vi.waitFor(() => {
    expect(harness.realtimeSignals.map((signal) => signal.channel)).toContain(
      "icons",
    );
  });
  const second = (await harness.behavior.callRpc("sidebar", {
    projectIds: ["proj_1"],
  })) as { icons: Record<string, { dataUrl: string | null }> };
  expect(second.icons.proj_1!.dataUrl).toBe(PIXEL_DATA_URL);
});

test("the favicon call honors the tabFavicon setting", async () => {
  const { bb, harness } = host();
  await plugin(bb);
  await harness.behavior.callRpc("setIcon", {
    projectId: "proj_1",
    mode: "upload",
    dataUrl: PIXEL_DATA_URL,
  });
  await expect(
    harness.behavior.callRpc("favicon", { projectId: "proj_1" }),
  ).resolves.toEqual({ enabled: true, dataUrl: PIXEL_DATA_URL });

  await harness.behavior.setSettings({ tabFavicon: false });
  await expect(
    harness.behavior.callRpc("favicon", { projectId: "proj_1" }),
  ).resolves.toEqual({ enabled: false, dataUrl: null });
});

test("a settings change is picked up without a reload", async () => {
  const { bb, harness } = host();
  await plugin(bb);
  await harness.behavior.setSettings({ showPullRequests: true });
  const result = (await harness.behavior.callRpc("sidebar", {
    projectIds: [],
  })) as { features: { showPullRequests: boolean } };
  expect(result.features.showPullRequests).toBe(true);
});

test("setIcon rejects a payload that is not an image data URL", async () => {
  const { bb, harness } = host();
  await plugin(bb);
  await expect(
    harness.behavior.callRpc("setIcon", {
      projectId: "proj_1",
      mode: "upload",
      dataUrl: "https://example.test/logo.png",
    }),
  ).rejects.toThrow();
});

test("the nightly sweep resolves icons for every project with a remote", async () => {
  const { bb, harness } = host();
  await plugin(bb);
  await harness.behavior.runSchedule("sweep");
  const result = (await harness.behavior.callRpc("sidebar", {
    projectIds: ["proj_1", "proj_personal"],
  })) as { icons: Record<string, { dataUrl: string | null; error: string | null }> };
  expect(result.icons.proj_1!.dataUrl).toBe(PIXEL_DATA_URL);
  expect(result.icons.proj_personal!.dataUrl).toBeNull();
  expect(result.icons.proj_personal!.error).toBeNull();
});

test("the CLI reads and writes the same store as the UI", async () => {
  const { bb, harness } = host();
  await plugin(bb);
  const set = await harness.behavior.runCli([
    "set",
    "bb",
    "--url",
    "https://example.test/logo.png",
  ]);
  expect(set.exitCode).toBe(0);
  const list = await harness.behavior.runCli(["list"]);
  expect(list.stdout).toContain("url: icon from url");
});

test("dispose aborts in-flight icon work", async () => {
  const { bb, harness } = host();
  await plugin(bb);
  // A forge that never answers: the request must end when the plugin unloads,
  // not hang on to a replaced registration set.
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("Aborted.")),
          );
        }),
    ),
  );
  const inFlight = harness.behavior.callRpc("refreshIcon", {
    projectId: "proj_1",
  });
  await harness.lifecycle.dispose();
  // The request ends with the load that started it: the abort reaches fetch,
  // and the write that would have landed in a replaced registration set is
  // refused by the host rather than applied.
  await expect(inFlight).rejects.toThrow(/stale API handle/);
});
