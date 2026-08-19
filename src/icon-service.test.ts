import { beforeEach, expect, test, vi } from "vitest";
import { IconService, type IconServiceProject } from "./icon-service";
import { readIcon, type IconKv } from "./icon-store";
import type { FetchLike } from "./resolve-icon";
import { ICON_BYTES_MAX } from "./icon-record";

function fakeKv(): IconKv {
  const rows = new Map<string, unknown>();
  return {
    get: async (key) => rows.get(key) as never,
    set: async (key, value) => void rows.set(key, JSON.parse(JSON.stringify(value))),
    delete: async (key) => void rows.delete(key),
    list: async (prefix) =>
      [...rows.keys()].filter(
        (key) => prefix === undefined || key.startsWith(prefix),
      ),
  };
}

const PIXEL_DATA_URL = "data:image/png;base64,AQIDBA==";
const NOW = 1_700_000_000_000;

function imageFetch(): FetchLike {
  return async () => ({
    ok: true,
    status: 200,
    headers: { get: (name) => (name === "content-type" ? "image/png" : null) },
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer as ArrayBuffer,
    json: async () => null,
  });
}

function missingFetch(): FetchLike {
  return async () => ({
    ok: false,
    status: 404,
    headers: { get: () => null },
    arrayBuffer: async () => new ArrayBuffer(0),
    json: async () => null,
  });
}

let kv: IconKv;
let changes: string[];
let projects: IconServiceProject[];

function makeService(fetchImpl: FetchLike) {
  return new IconService({
    kv,
    fetchImpl,
    signal: new AbortController().signal,
    now: () => NOW,
    listProjects: async () => projects,
    onChange: (projectId) => changes.push(projectId),
    log: () => {},
  });
}

beforeEach(() => {
  kv = fakeKv();
  changes = [];
  projects = [
    { id: "proj_1", gitRemoteUrl: "git@github.com:get-bb/bb.git" },
    { id: "proj_personal", gitRemoteUrl: null },
  ];
});

test("a project with a GitHub remote resolves its avatar and caches it", async () => {
  const service = makeService(imageFetch());
  const first = await service.iconsFor(["proj_1"]);
  // The read itself never waits on the forge.
  expect(first.proj_1).toMatchObject({ mode: "auto", dataUrl: null });

  await vi.waitFor(async () => {
    expect((await readIcon(kv, "proj_1")).dataUrl).toBe(PIXEL_DATA_URL);
  });
  const second = await service.iconsFor(["proj_1"]);
  expect(second.proj_1).toMatchObject({
    dataUrl: PIXEL_DATA_URL,
    origin: "github-avatar",
    error: null,
  });
  expect(changes).toContain("proj_1");
});

test("a project with no remote is left alone, without an error", async () => {
  const fetchImpl = vi.fn(imageFetch());
  projects = [{ id: "proj_personal", gitRemoteUrl: null }];
  const service = makeService(fetchImpl);
  await service.iconsFor(["proj_personal"]);
  await service.sweep();
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(await readIcon(kv, "proj_personal")).toMatchObject({
    dataUrl: null,
    error: null,
  });
});

test("a failed lookup records the reason and keeps the mode", async () => {
  const service = makeService(missingFetch());
  await service.sweep();
  const record = await readIcon(kv, "proj_1");
  expect(record.mode).toBe("auto");
  expect(record.dataUrl).toBeNull();
  expect(record.error).toContain("404");
  expect(record.attemptedAt).toBe(NOW);
});

test("concurrent reads collapse into one resolution", async () => {
  const fetchImpl = vi.fn(imageFetch());
  const service = makeService(fetchImpl);
  await Promise.all([
    service.iconsFor(["proj_1"]),
    service.iconsFor(["proj_1"]),
    service.iconsFor(["proj_1"]),
  ]);
  await vi.waitFor(async () => {
    expect((await readIcon(kv, "proj_1")).dataUrl).not.toBeNull();
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("a URL override is fetched server-side and stored", async () => {
  const service = makeService(imageFetch());
  const icon = await service.setIcon({
    projectId: "proj_1",
    mode: "url",
    url: "https://example.test/logo.png",
  });
  expect(icon).toMatchObject({
    mode: "url",
    origin: "url",
    dataUrl: PIXEL_DATA_URL,
    sourceUrl: "https://example.test/logo.png",
    error: null,
  });
});

test("a URL that does not serve an image is reported, not stored as bytes", async () => {
  const service = makeService(missingFetch());
  const icon = await service.setIcon({
    projectId: "proj_1",
    mode: "url",
    url: "https://example.test/missing.png",
  });
  expect(icon.dataUrl).toBeNull();
  expect(icon.error).toContain("404");
  expect(icon.mode).toBe("url");
});

test("an upload is stored as-is and refresh leaves it alone", async () => {
  const fetchImpl = vi.fn(imageFetch());
  const service = makeService(fetchImpl);
  await service.setIcon({
    projectId: "proj_1",
    mode: "upload",
    dataUrl: PIXEL_DATA_URL,
  });
  const refreshed = await service.refresh("proj_1");
  expect(refreshed).toMatchObject({ mode: "upload", dataUrl: PIXEL_DATA_URL });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("an upload over the byte cap is refused", async () => {
  const service = makeService(imageFetch());
  const big = `data:image/png;base64,${"A".repeat(Math.ceil((ICON_BYTES_MAX + 1024) / 3) * 4)}`;
  await expect(
    service.setIcon({ projectId: "proj_1", mode: "upload", dataUrl: big }),
  ).rejects.toThrow(/larger than/);
});

test("mode none keeps a project iconless and blocks resolution", async () => {
  const fetchImpl = vi.fn(imageFetch());
  const service = makeService(fetchImpl);
  await service.setIcon({ projectId: "proj_1", mode: "none" });
  await service.sweep();
  await service.iconsFor(["proj_1"]);
  expect(fetchImpl).not.toHaveBeenCalled();
  expect((await service.iconsFor(["proj_1"])).proj_1).toMatchObject({
    mode: "none",
    dataUrl: null,
  });
});

test("switching back to auto clears the override and resolves again", async () => {
  const service = makeService(imageFetch());
  await service.setIcon({
    projectId: "proj_1",
    mode: "upload",
    dataUrl: PIXEL_DATA_URL,
  });
  const icon = await service.setIcon({ projectId: "proj_1", mode: "auto" });
  expect(icon).toMatchObject({
    mode: "auto",
    origin: "github-avatar",
    dataUrl: PIXEL_DATA_URL,
  });
});

test("a moved remote replaces the cached icon", async () => {
  const service = makeService(imageFetch());
  await service.sweep();
  expect((await readIcon(kv, "proj_1")).remoteUrl).toBe(
    "git@github.com:get-bb/bb.git",
  );
  projects = [{ id: "proj_1", gitRemoteUrl: "git@github.com:acme/other.git" }];
  await service.sweep();
  expect((await readIcon(kv, "proj_1")).remoteUrl).toBe(
    "git@github.com:acme/other.git",
  );
});

test("refresh re-fetches a URL override", async () => {
  const fetchImpl = vi.fn(imageFetch());
  const service = makeService(fetchImpl);
  await service.setIcon({
    projectId: "proj_1",
    mode: "url",
    url: "https://example.test/logo.png",
  });
  await service.refresh("proj_1");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
