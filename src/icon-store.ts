/**
 * Icon records in `bb.storage.kv`, one key per project.
 *
 * kv rather than `bb.storage.database()`: a record is a mode, a URL, and one
 * 128px image, all of which fit in a kv value with room to spare, and the only
 * query this plugin needs is "give me these projects' icons".
 */
import {
  DEFAULT_ICON_RECORD,
  iconRecordSchema,
  type IconRecord,
} from "./icon-record";

const KEY_PREFIX = "icon:";

/** The slice of `bb.storage.kv` this plugin uses. */
export interface IconKv {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keys only — kv lists keys, so reading values is a get per key. */
  list(prefix?: string): Promise<readonly string[]>;
}

export function iconKey(projectId: string): string {
  return `${KEY_PREFIX}${projectId}`;
}

export function projectIdFromKey(key: string): string | null {
  return key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : null;
}

/**
 * Reads one record, falling back to the default. A record written by a newer
 * version of this plugin (or corrupted by hand) is treated as absent instead
 * of failing the caller: an unreadable icon must never break a sidebar.
 */
export async function readIcon(
  kv: IconKv,
  projectId: string,
): Promise<IconRecord> {
  const stored = await kv.get<unknown>(iconKey(projectId));
  if (stored === undefined) return DEFAULT_ICON_RECORD;
  const parsed = iconRecordSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_ICON_RECORD;
}

export async function writeIcon(
  kv: IconKv,
  projectId: string,
  record: IconRecord,
): Promise<void> {
  await kv.set(iconKey(projectId), iconRecordSchema.parse(record));
}

/** Drops a project's record entirely, restoring the default `auto` behavior. */
export async function clearIcon(kv: IconKv, projectId: string): Promise<void> {
  await kv.delete(iconKey(projectId));
}

export async function readAllIcons(
  kv: IconKv,
): Promise<Map<string, IconRecord>> {
  const keys = await kv.list(KEY_PREFIX);
  const icons = new Map<string, IconRecord>();
  for (const key of keys) {
    const projectId = projectIdFromKey(key);
    if (projectId === null) continue;
    const parsed = iconRecordSchema.safeParse(await kv.get<unknown>(key));
    if (parsed.success) icons.set(projectId, parsed.data);
  }
  return icons;
}

/** How long a successfully resolved `auto` icon is trusted before a re-check. */
export const AUTO_ICON_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Backoff after a failed `auto` resolution, so a dead forge is not hammered. */
export const AUTO_ICON_RETRY_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Whether an `auto` record should be resolved again now. Splitting this out of
 * the factory keeps the interesting rules — changed remote, stale success,
 * failure backoff — testable without a network or a clock.
 */
export function needsAutoResolve(
  record: IconRecord,
  { remoteUrl, now }: { remoteUrl: string | null; now: number },
): boolean {
  if (record.mode !== "auto") return false;
  if (remoteUrl === null) return false;
  if (record.remoteUrl !== remoteUrl) return true;
  if (record.dataUrl === null) {
    return (
      record.attemptedAt === null ||
      now - record.attemptedAt >= AUTO_ICON_RETRY_AFTER_MS
    );
  }
  return (
    record.fetchedAt === null || now - record.fetchedAt >= AUTO_ICON_MAX_AGE_MS
  );
}
