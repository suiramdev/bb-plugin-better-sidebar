import { expect, test, vi } from "vitest";
import { FaviconController, projectIdFromPath } from "./favicon";

test.each([
  ["/projects/proj_1", "proj_1"],
  ["/projects/proj_1/threads/thr_2", "proj_1"],
  ["/projects/proj_1/settings", "proj_1"],
  ["/projects/proj%5F1", "proj_1"],
  ["/threads/thr_2", null],
  ["/", null],
  ["/extensions/plugins/better-sidebar", null],
  ["/projects", null],
])("projectIdFromPath(%s)", (pathname, expected) => {
  expect(projectIdFromPath(pathname)).toBe(expected);
});

function fakeDocument() {
  const links = {
    "favicon-32": { href: "/favicon-32x32.png" },
    "favicon-16": { href: "/favicon-16x16.png" },
  } as Record<string, { href: string }>;
  return {
    links,
    getElementById: (id: string) => links[id] ?? null,
  };
}

function controller(document = fakeDocument()) {
  let notify: (() => void) | null = null;
  const stop = vi.fn();
  const instance = new FaviconController({
    document,
    observe: (_links, onChanged) => {
      notify = onChanged;
      return stop;
    },
  });
  return { instance, document, stop, foreignWrite: () => notify?.() };
}

const ICON = "data:image/png;base64,AQIDBA==";

test("applying an icon writes both of bb's favicon links", () => {
  const { instance, document } = controller();
  instance.apply(ICON);
  expect(document.links["favicon-32"]!.href).toBe(ICON);
  expect(document.links["favicon-16"]!.href).toBe(ICON);
});

test("a later bb write is reasserted", () => {
  const { instance, document, foreignWrite } = controller();
  instance.apply(ICON);
  document.links["favicon-32"]!.href = "/favicon-32x32-unread.png";
  foreignWrite();
  expect(document.links["favicon-32"]!.href).toBe(ICON);
});

test("clearing restores the hrefs bb had and stops watching", () => {
  const { instance, document, stop } = controller();
  instance.apply(ICON);
  instance.apply(null);
  expect(document.links["favicon-32"]!.href).toBe("/favicon-32x32.png");
  expect(document.links["favicon-16"]!.href).toBe("/favicon-16x16.png");
  expect(stop).toHaveBeenCalled();
});

test("dispose restores even after several projects", () => {
  const { instance, document } = controller();
  instance.apply(ICON);
  instance.apply("data:image/png;base64,BQYHCA==");
  instance.dispose();
  expect(document.links["favicon-16"]!.href).toBe("/favicon-16x16.png");
});

test("the watcher is installed once, not once per apply", () => {
  const document = fakeDocument();
  const observe = vi.fn(() => vi.fn());
  const instance = new FaviconController({ document, observe });
  instance.apply(ICON);
  instance.apply("data:image/png;base64,BQYHCA==");
  expect(observe).toHaveBeenCalledTimes(1);
});

test("a document without bb's favicon links is left alone", () => {
  const observe = vi.fn(() => vi.fn());
  const instance = new FaviconController({
    document: { getElementById: () => null },
    observe,
  });
  instance.apply(ICON);
  expect(observe).not.toHaveBeenCalled();
});
