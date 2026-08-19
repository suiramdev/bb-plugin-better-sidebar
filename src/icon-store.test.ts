import { expect, test } from "vitest";
import { DEFAULT_ICON_RECORD, type IconRecord } from "./icon-record";
import {
  AUTO_ICON_MAX_AGE_MS,
  AUTO_ICON_RETRY_AFTER_MS,
  needsAutoResolve,
  readAllIcons,
  readIcon,
  writeIcon,
  type IconKv,
} from "./icon-store";

function fakeKv(): IconKv & { rows: Map<string, unknown> } {
  const rows = new Map<string, unknown>();
  return {
    rows,
    get: async (key) => rows.get(key) as never,
    set: async (key, value) => void rows.set(key, value),
    delete: async (key) => void rows.delete(key),
    list: async (prefix) =>
      [...rows.keys()].filter(
        (key) => prefix === undefined || key.startsWith(prefix),
      ),
  };
}

const NOW = 1_700_000_000_000;

test("a round trip preserves the record; an unknown project reads the default", async () => {
  const kv = fakeKv();
  const record: IconRecord = {
    ...DEFAULT_ICON_RECORD,
    mode: "url",
    sourceUrl: "https://example.test/i.png",
    dataUrl: "data:image/png;base64,AQIDBA==",
    origin: "url",
    fetchedAt: NOW,
    attemptedAt: NOW,
  };
  await writeIcon(kv, "proj_1", record);
  expect(await readIcon(kv, "proj_1")).toEqual(record);
  expect(await readIcon(kv, "proj_missing")).toEqual(DEFAULT_ICON_RECORD);
});

test("a corrupt record reads as the default instead of throwing", async () => {
  const kv = fakeKv();
  kv.rows.set("icon:proj_1", { mode: "nonsense" });
  expect(await readIcon(kv, "proj_1")).toEqual(DEFAULT_ICON_RECORD);
  expect(await readAllIcons(kv)).toEqual(new Map());
});

test("readAllIcons keys by project id and ignores foreign kv rows", async () => {
  const kv = fakeKv();
  await writeIcon(kv, "proj_1", DEFAULT_ICON_RECORD);
  kv.rows.set("load-count", 3);
  expect([...(await readAllIcons(kv)).keys()]).toEqual(["proj_1"]);
});

test("needsAutoResolve only fires for auto records with a remote", () => {
  const base = { ...DEFAULT_ICON_RECORD, remoteUrl: "git@github.com:a/b.git" };
  expect(needsAutoResolve(base, { remoteUrl: null, now: NOW })).toBe(false);
  expect(
    needsAutoResolve(
      { ...base, mode: "none" },
      { remoteUrl: "git@github.com:a/b.git", now: NOW },
    ),
  ).toBe(false);
});

test("a changed remote re-resolves even a fresh icon", () => {
  const record: IconRecord = {
    ...DEFAULT_ICON_RECORD,
    dataUrl: "data:image/png;base64,AQIDBA==",
    fetchedAt: NOW,
    remoteUrl: "git@github.com:a/old.git",
  };
  expect(
    needsAutoResolve(record, { remoteUrl: "git@github.com:a/new.git", now: NOW }),
  ).toBe(true);
});

test("a fresh success is trusted; a stale one is re-resolved", () => {
  const record: IconRecord = {
    ...DEFAULT_ICON_RECORD,
    dataUrl: "data:image/png;base64,AQIDBA==",
    fetchedAt: NOW,
    remoteUrl: "git@github.com:a/b.git",
  };
  const remoteUrl = "git@github.com:a/b.git";
  expect(needsAutoResolve(record, { remoteUrl, now: NOW + 1000 })).toBe(false);
  expect(
    needsAutoResolve(record, { remoteUrl, now: NOW + AUTO_ICON_MAX_AGE_MS }),
  ).toBe(true);
});

test("a failure retries after the backoff, not before", () => {
  const record: IconRecord = {
    ...DEFAULT_ICON_RECORD,
    error: "404",
    attemptedAt: NOW,
    remoteUrl: "git@github.com:a/b.git",
  };
  const remoteUrl = "git@github.com:a/b.git";
  expect(needsAutoResolve(record, { remoteUrl, now: NOW + 60_000 })).toBe(false);
  expect(
    needsAutoResolve(record, { remoteUrl, now: NOW + AUTO_ICON_RETRY_AFTER_MS }),
  ).toBe(true);
});

test("a never-attempted auto record resolves immediately", () => {
  expect(
    needsAutoResolve(DEFAULT_ICON_RECORD, {
      remoteUrl: "git@github.com:a/b.git",
      now: NOW,
    }),
  ).toBe(true);
});
