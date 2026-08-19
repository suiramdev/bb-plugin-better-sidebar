/**
 * The wire contract shared by `server.ts` and `app.tsx`. The frontend imports
 * only its type, so this module's runtime code never reaches the app bundle.
 */
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  ICON_ORIGINS,
  iconDataUrlSchema,
  iconModeSchema,
} from "./icon-record";

/** One project's icon as the frontend sees it. */
export const publicIconSchema = z.object({
  mode: iconModeSchema,
  dataUrl: z.string().nullable(),
  origin: z.enum(ICON_ORIGINS).nullable(),
  sourceUrl: z.string().nullable(),
  error: z.string().nullable(),
  fetchedAt: z.number().nullable(),
  /** True while a background resolution for this project is in flight. */
  isResolving: z.boolean(),
});
export type PublicIcon = z.infer<typeof publicIconSchema>;

export const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  isPersonal: z.boolean(),
  gitRemoteUrl: z.string().nullable(),
  icon: publicIconSchema,
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const featureFlagsSchema = z.object({
  projectIcons: z.boolean(),
  tabFavicon: z.boolean(),
  showBranch: z.boolean(),
  showPullRequests: z.boolean(),
});
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

/** Realtime channel: published whenever a project's icon record changes. */
export const ICONS_CHANNEL = "icons";

export const rpcContract = defineRpcContract({
  /** Everything the settings screen needs in one call. */
  overview: {
    input: z.null(),
    output: z.object({
      features: featureFlagsSchema,
      projects: z.array(projectSummarySchema),
    }),
  },
  /**
   * Icons for the projects a sidebar is showing, plus the feature flags that
   * decide what it draws. Missing `auto` icons are resolved in the background;
   * the call itself never waits on a forge.
   */
  sidebar: {
    input: z.object({ projectIds: z.array(z.string()).max(500) }).strict(),
    output: z.object({
      features: featureFlagsSchema,
      icons: z.record(z.string(), publicIconSchema),
    }),
  },
  /** One project's icon for the browser tab, or null when it has none. */
  favicon: {
    input: z.object({ projectId: z.string() }).strict(),
    output: z.object({ enabled: z.boolean(), dataUrl: z.string().nullable() }),
  },
  setIcon: {
    input: z
      .object({
        projectId: z.string().min(1),
        mode: iconModeSchema,
        /** Required for `url`: fetched server-side, so CORS never applies. */
        url: z.string().url().max(2048).optional(),
        /** Required for `upload`: a data URL the frontend already rasterized. */
        dataUrl: iconDataUrlSchema.optional(),
      })
      .strict(),
    output: z.object({ icon: publicIconSchema }),
  },
  /** Re-resolve now, ignoring the freshness and backoff rules. */
  refreshIcon: {
    input: z.object({ projectId: z.string().min(1) }).strict(),
    output: z.object({ icon: publicIconSchema }),
  },
});
