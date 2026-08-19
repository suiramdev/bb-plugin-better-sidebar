import { expect, test, vi } from "vitest";
import { fetchIconImage, resolveIcon, type FetchLike } from "./resolve-icon";
import { ICON_BYTES_MAX } from "./icon-record";

function imageResponse(
  bytes: Uint8Array,
  contentType = "image/png",
): Awaited<ReturnType<FetchLike>> {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => (name === "content-type" ? contentType : null) },
    arrayBuffer: async () => bytes.buffer.slice(0) as ArrayBuffer,
    json: async () => null,
  };
}

function failedResponse(status: number): Awaited<ReturnType<FetchLike>> {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    arrayBuffer: async () => new ArrayBuffer(0),
    json: async () => null,
  };
}

const PIXEL = new Uint8Array([1, 2, 3, 4]);

test("a valid image becomes a data URL", async () => {
  const result = await fetchIconImage("https://example.test/i.png", {
    fetchImpl: async () => imageResponse(PIXEL),
  });
  expect(result).toEqual({
    ok: true,
    icon: { dataUrl: "data:image/png;base64,AQIDBA==", mimeType: "image/png" },
  });
});

test("an HTML response is refused rather than stored", async () => {
  const result = await fetchIconImage("https://example.test/i.png", {
    fetchImpl: async () => imageResponse(PIXEL, "text/html; charset=utf-8"),
  });
  expect(result).toMatchObject({ ok: false });
  expect(result).toMatchObject({ error: expect.stringContaining("text/html") });
});

test("an oversized image is refused", async () => {
  const result = await fetchIconImage("https://example.test/i.png", {
    fetchImpl: async () => imageResponse(new Uint8Array(ICON_BYTES_MAX + 1)),
  });
  expect(result).toMatchObject({
    ok: false,
    error: expect.stringContaining("limit"),
  });
});

test("a network failure is reported, not thrown", async () => {
  const result = await fetchIconImage("https://example.test/i.png", {
    fetchImpl: async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    },
  });
  expect(result).toEqual({ ok: false, error: "getaddrinfo ENOTFOUND" });
});

test("a hanging request aborts at the timeout", async () => {
  const result = await fetchIconImage("https://example.test/i.png", {
    timeoutMs: 5,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("Timed out.")),
        );
      }),
  });
  expect(result).toEqual({ ok: false, error: "Timed out." });
});

test("resolveIcon falls through to the next candidate and records the origin", async () => {
  const fetchImpl = vi.fn<FetchLike>(async (url) =>
    url.includes("avatar") ? failedResponse(404) : imageResponse(PIXEL, "image/x-icon"),
  );
  const result = await resolveIcon(
    [
      { kind: "image", url: "https://github.com/avatar.png", origin: "github-avatar" },
      { kind: "image", url: "https://github.com/favicon.ico", origin: "host-favicon" },
    ],
    { fetchImpl },
  );
  expect(result).toMatchObject({ ok: true, icon: { origin: "host-favicon" } });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test("resolveIcon reads GitLab's avatar_url before fetching bytes", async () => {
  const fetchImpl = vi.fn<FetchLike>(async (url) => {
    if (url.startsWith("https://gitlab.com/api")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async () => ({ avatar_url: "https://gitlab.com/uploads/a.png" }),
      };
    }
    return imageResponse(PIXEL);
  });
  const result = await resolveIcon(
    [
      {
        kind: "gitlab-project",
        apiUrl: "https://gitlab.com/api/v4/projects/group%2Fapp",
        origin: "gitlab-avatar",
      },
    ],
    { fetchImpl },
  );
  expect(result).toMatchObject({ ok: true, icon: { origin: "gitlab-avatar" } });
  expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://gitlab.com/uploads/a.png");
});

test("a GitLab project with no avatar is a plain miss", async () => {
  const result = await resolveIcon(
    [
      {
        kind: "gitlab-project",
        apiUrl: "https://gitlab.com/api/v4/projects/group%2Fapp",
        origin: "gitlab-avatar",
      },
    ],
    {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async () => ({ avatar_url: null }),
      }),
    },
  );
  expect(result).toMatchObject({
    ok: false,
    error: expect.stringContaining("no avatar"),
  });
});

test("no candidates means nothing to resolve", async () => {
  const fetchImpl = vi.fn<FetchLike>();
  await expect(resolveIcon([], { fetchImpl })).resolves.toEqual({
    ok: false,
    error: "This project has no git remote to resolve.",
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});
