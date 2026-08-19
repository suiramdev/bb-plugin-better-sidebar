// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { announceIconsChanged, mountFaviconSync } from "./favicon-script";

const ICON = "data:image/png;base64,AQIDBA==";
let dispose: (() => void) | null = null;
let controller: AbortController;

function seedFaviconLinks(): void {
  document.head.innerHTML = `
    <link id="favicon-32" rel="icon" href="/favicon-32x32.png" />
    <link id="favicon-16" rel="icon" href="/favicon-16x16.png" />
  `;
}

function href(id: string): string {
  return document.getElementById(id)!.getAttribute("href")!;
}

function navigate(pathname: string): void {
  history.pushState({}, "", pathname);
}

beforeEach(() => {
  seedFaviconLinks();
  history.replaceState({}, "", "/");
  controller = new AbortController();
});

afterEach(() => {
  dispose?.();
  dispose = null;
  controller.abort();
});

function mount(fetchFavicon: (projectId: string) => Promise<string | null>) {
  const spy = vi.fn(fetchFavicon);
  dispose = mountFaviconSync({
    pluginId: "better-sidebar",
    signal: controller.signal,
    fetchFavicon: spy,
  });
  return spy;
}

test("navigating into a project paints its icon and leaving restores bb's", async () => {
  const load = mount(async () => ICON);
  navigate("/projects/proj_1/threads/thr_1");
  await vi.waitFor(() => expect(href("favicon-32")).toBe(ICON));
  expect(load).toHaveBeenCalledWith("proj_1");

  navigate("/extensions/plugins/better-sidebar");
  expect(href("favicon-32")).toBe("/favicon-32x32.png");
});

test("a project's icon is fetched once and reused", async () => {
  const load = mount(async () => ICON);
  navigate("/projects/proj_1");
  await vi.waitFor(() => expect(href("favicon-16")).toBe(ICON));
  navigate("/projects/proj_1/settings");
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
});

test("a bb favicon write is reasserted", async () => {
  mount(async () => ICON);
  navigate("/projects/proj_1");
  await vi.waitFor(() => expect(href("favicon-32")).toBe(ICON));
  document.getElementById("favicon-32")!.setAttribute("href", "/unread.png");
  await vi.waitFor(() => expect(href("favicon-32")).toBe(ICON));
});

test("an icon change is picked up without navigating", async () => {
  let current: string | null = null;
  const load = mount(async () => current);
  navigate("/projects/proj_1");
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  expect(href("favicon-32")).toBe("/favicon-32x32.png");

  current = ICON;
  announceIconsChanged();
  await vi.waitFor(() => expect(href("favicon-32")).toBe(ICON));
});

test("a project with no icon leaves bb's favicon alone", async () => {
  mount(async () => null);
  navigate("/projects/proj_1");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(href("favicon-32")).toBe("/favicon-32x32.png");
});

test("a failed lookup is retried on the next navigation", async () => {
  const load = mount(async () => {
    throw new Error("offline");
  });
  navigate("/projects/proj_1");
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  navigate("/projects/proj_1/settings");
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
});

test("disposing restores history and the favicon", async () => {
  const pushState = history.pushState;
  const load = mount(async () => ICON);
  navigate("/projects/proj_1");
  await vi.waitFor(() => expect(href("favicon-32")).toBe(ICON));

  dispose?.();
  dispose = null;
  expect(href("favicon-32")).toBe("/favicon-32x32.png");
  expect(history.pushState).toBe(pushState);
  navigate("/projects/proj_2");
  expect(load).toHaveBeenCalledTimes(1);
});

test("the real rpc endpoint is called when no loader is injected", async () => {
  const fetchMock = vi.fn(async () => ({
    json: async () => ({ ok: true, result: { enabled: true, dataUrl: ICON } }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  dispose = mountFaviconSync({
    pluginId: "better-sidebar",
    signal: controller.signal,
  });
  navigate("/projects/proj_9");
  await vi.waitFor(() => expect(href("favicon-32")).toBe(ICON));
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/v1/plugins/better-sidebar/rpc/favicon",
    expect.objectContaining({ method: "POST", body: '{"projectId":"proj_9"}' }),
  );
  vi.unstubAllGlobals();
});
