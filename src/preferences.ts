/**
 * How the sidebar is ordered, stored in this plugin's kv.
 *
 * The mode is plugin state, so it lives here. The *manual* order is not: it is
 * BB's own project order, moved through `bb.sdk.projects.reorder`, so dragging a
 * project in this sidebar reorders it in BB's own list too instead of keeping a
 * private order that drifts.
 */
import { z } from "zod";

export const PROJECT_SORT_MODES = [
  "activity",
  "manual",
  "alphabetical",
  "newest",
  "oldest",
] as const;

export const projectSortSchema = z.enum(PROJECT_SORT_MODES);
export type ProjectSort = z.infer<typeof projectSortSchema>;

/** Labels shared by the sidebar menu, the settings page, and the CLI. */
export const PROJECT_SORT_LABELS: Record<ProjectSort, string> = {
  activity: "Last activity",
  manual: "Manual (drag to reorder)",
  alphabetical: "Alphabetical",
  newest: "Newest project first",
  oldest: "Oldest project first",
};

export const preferencesSchema = z.object({
  projectSort: projectSortSchema,
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = { projectSort: "activity" };

const PREFERENCES_KEY = "preferences";

export interface PreferencesKv {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

/** Unreadable stored preferences fall back to the default, never throw. */
export async function readPreferences(kv: PreferencesKv): Promise<Preferences> {
  const parsed = preferencesSchema.safeParse(await kv.get<unknown>(PREFERENCES_KEY));
  return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
}

export async function writePreferences(
  kv: PreferencesKv,
  preferences: Preferences,
): Promise<Preferences> {
  const next = preferencesSchema.parse(preferences);
  await kv.set(PREFERENCES_KEY, next);
  return next;
}
