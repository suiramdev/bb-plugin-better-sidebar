/**
 * The shape of one project's icon, as stored and as sent to the frontend.
 *
 * Icons live in `bb.storage.kv`, whose values cap at 256KB, so bytes are held
 * as a data URL and every write goes through `ICON_DATA_URL_MAX_LENGTH`. That
 * is deliberate: an icon is a 128px glyph, and the frontend rasterizes what
 * the user uploads before it ever reaches the server.
 */
import { z } from "zod";

/** Where an icon's bytes came from, for the "why am I seeing this" line. */
export const ICON_ORIGINS = [
  "github-avatar",
  "gitlab-avatar",
  "host-favicon",
  "url",
  "upload",
] as const;

export const iconModeSchema = z.enum(["auto", "url", "upload", "none"]);
/** How a project's icon is chosen. `auto` resolves from the git remote. */
export type IconMode = z.infer<typeof iconModeSchema>;

/**
 * ~171KB of base64 at the ceiling, comfortably inside the 256KB kv value cap
 * once JSON quoting and the rest of the record are counted.
 */
export const ICON_BYTES_MAX = 96 * 1024;
export const ICON_DATA_URL_MAX_LENGTH = 180 * 1024;

/** Image types worth trusting as an icon; anything else is refused. */
export const ICON_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
] as const;

export const iconDataUrlSchema = z
  .string()
  .max(ICON_DATA_URL_MAX_LENGTH, "Icon is too large.")
  .refine(
    (value) => /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(value),
    "Expected a base64 image data URL.",
  );

export const iconRecordSchema = z.object({
  mode: iconModeSchema,
  /** The URL the user typed, kept in `url` mode so it can be re-fetched. */
  sourceUrl: z.string().nullable(),
  /** Rendered bytes, or null when nothing could be resolved yet. */
  dataUrl: iconDataUrlSchema.nullable(),
  origin: z.enum(ICON_ORIGINS).nullable(),
  /** Human-readable reason the last resolution attempt produced nothing. */
  error: z.string().nullable(),
  /** When bytes were last fetched successfully, epoch ms. */
  fetchedAt: z.number().nullable(),
  /** When resolution last ran, successful or not, epoch ms. */
  attemptedAt: z.number().nullable(),
  /**
   * The project's git remote at the time an `auto` icon was resolved. A
   * project that gains or changes a remote is re-resolved rather than keeping
   * an icon from the previous repository.
   */
  remoteUrl: z.string().nullable(),
});
export type IconRecord = z.infer<typeof iconRecordSchema>;

export const DEFAULT_ICON_RECORD: IconRecord = {
  mode: "auto",
  sourceUrl: null,
  dataUrl: null,
  origin: null,
  error: null,
  fetchedAt: null,
  attemptedAt: null,
  remoteUrl: null,
};

/** Base64 payload length → decoded byte length, without decoding it. */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? 0 : base64ByteLength(dataUrl.slice(comma + 1));
}

export function toDataUrl(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * Normalizes a fetched content type to one of {@link ICON_MIME_TYPES}, or
 * null when the response is not an image type this plugin will store.
 */
export function normalizeImageMimeType(contentType: string | null): string | null {
  if (contentType === null) return null;
  const mimeType = contentType.split(";")[0]!.trim().toLowerCase();
  return (ICON_MIME_TYPES as readonly string[]).includes(mimeType)
    ? mimeType
    : null;
}
