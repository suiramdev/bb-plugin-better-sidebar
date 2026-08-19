/**
 * Fetching icon bytes. Every network call in this plugin lives here, takes an
 * injected `fetch`, and is bounded by a timeout and a byte cap — a forge that
 * hangs or serves a 4MB PNG must not stall a sidebar or blow the kv cap.
 */
import {
  ICON_BYTES_MAX,
  normalizeImageMimeType,
  toDataUrl,
} from "./icon-record";
import type { IconCandidate } from "./icon-sources";

export const ICON_FETCH_TIMEOUT_MS = 8_000;

export type FetchLike = (
  input: string,
  init?: { redirect?: "follow"; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
}>;

export interface FetchedIcon {
  dataUrl: string;
  mimeType: string;
}

export type IconFetchOutcome =
  | { ok: true; icon: FetchedIcon }
  | { ok: false; error: string };

interface FetchIconOptions {
  fetchImpl: FetchLike;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Timed out.")), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) controller.abort(signal.reason);
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message;
  return "Request failed.";
}

/** Fetches one URL and validates it as a storable icon. Never throws. */
export async function fetchIconImage(
  url: string,
  { fetchImpl, signal, timeoutMs = ICON_FETCH_TIMEOUT_MS }: FetchIconOptions,
): Promise<IconFetchOutcome> {
  const bounded = withTimeout(signal, timeoutMs);
  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: bounded.signal,
    });
    if (!response.ok) {
      return { ok: false, error: `${url} responded ${response.status}.` };
    }
    const mimeType = normalizeImageMimeType(response.headers.get("content-type"));
    if (mimeType === null) {
      return {
        ok: false,
        error: `${url} did not return an image (${response.headers.get("content-type") ?? "no content type"}).`,
      };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) return { ok: false, error: `${url} was empty.` };
    if (bytes.byteLength > ICON_BYTES_MAX) {
      return {
        ok: false,
        error: `${url} is ${Math.round(bytes.byteLength / 1024)}KB, over the ${ICON_BYTES_MAX / 1024}KB limit.`,
      };
    }
    return { ok: true, icon: { dataUrl: toDataUrl(mimeType, bytes), mimeType } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  } finally {
    bounded.done();
  }
}

async function gitlabAvatarUrl(
  apiUrl: string,
  { fetchImpl, signal, timeoutMs = ICON_FETCH_TIMEOUT_MS }: FetchIconOptions,
): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const bounded = withTimeout(signal, timeoutMs);
  try {
    const response = await fetchImpl(apiUrl, {
      redirect: "follow",
      signal: bounded.signal,
    });
    if (!response.ok) {
      return { ok: false, error: `${apiUrl} responded ${response.status}.` };
    }
    const body = (await response.json()) as { avatar_url?: unknown } | null;
    const avatarUrl = body === null ? null : body.avatar_url;
    return {
      ok: true,
      url: typeof avatarUrl === "string" && avatarUrl !== "" ? avatarUrl : null,
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  } finally {
    bounded.done();
  }
}

export interface ResolvedIcon extends FetchedIcon {
  origin: IconCandidate["origin"];
}

/**
 * Walks candidates in order and returns the first one that yields an icon,
 * collecting the reasons the earlier ones did not. A project whose forge has
 * no avatar is the normal case, not an error, so the collected reasons are
 * only surfaced when every candidate failed.
 */
export async function resolveIcon(
  candidates: readonly IconCandidate[],
  options: FetchIconOptions,
): Promise<{ ok: true; icon: ResolvedIcon } | { ok: false; error: string }> {
  if (candidates.length === 0) {
    return { ok: false, error: "This project has no git remote to resolve." };
  }
  const reasons: string[] = [];
  for (const candidate of candidates) {
    if (options.signal?.aborted) return { ok: false, error: "Cancelled." };
    if (candidate.kind === "gitlab-project") {
      const avatar = await gitlabAvatarUrl(candidate.apiUrl, options);
      if (!avatar.ok) {
        reasons.push(avatar.error);
        continue;
      }
      if (avatar.url === null) {
        reasons.push(`${candidate.apiUrl} has no avatar.`);
        continue;
      }
      const image = await fetchIconImage(avatar.url, options);
      if (image.ok) {
        return { ok: true, icon: { ...image.icon, origin: candidate.origin } };
      }
      reasons.push(image.error);
      continue;
    }
    const image = await fetchIconImage(candidate.url, options);
    if (image.ok) {
      return { ok: true, icon: { ...image.icon, origin: candidate.origin } };
    }
    reasons.push(image.error);
  }
  return { ok: false, error: reasons.join(" ") };
}
