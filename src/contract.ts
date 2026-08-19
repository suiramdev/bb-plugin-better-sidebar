/**
 * The wire contract shared by `server.ts` and `app.tsx`. The frontend imports
 * only its type, so this module's runtime code never reaches the app bundle.
 */
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { ICON_ORIGINS, iconDataUrlSchema, iconModeSchema } from "./icon-record";
import { preferencesSchema, projectSortSchema } from "./preferences";

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

/**
 * What the sidebar needs to order projects, which the host's own sidebar
 * payload does not carry: a creation date, and BB's manual position.
 */
export const projectOrderEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  isPersonal: z.boolean(),
  createdAt: z.number(),
  /**
   * Index in BB's project order, or null for the personal project, which sits
   * outside that order and therefore cannot be dragged.
   */
  position: z.number().nullable(),
});
export type ProjectOrderEntry = z.infer<typeof projectOrderEntrySchema>;

export const featureFlagsSchema = z.object({
  projectIcons: z.boolean(),
  tabFavicon: z.boolean(),
  showBranch: z.boolean(),
  showPullRequests: z.boolean(),
  stackedThreads: z.boolean(),
});
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

/**
 * One environment's place in a stack of branches. `baseBranch` is the branch it
 * was cut from — the only thing that says a thread is *based on* another, since
 * bb chooses a thread's parent and its base branch independently.
 */
export const environmentBranchSchema = z.object({
  branchName: z.string().nullable(),
  baseBranch: z.string().nullable(),
  /** Trunk: a branch cut from it starts a stack rather than joining one. */
  defaultBranch: z.string().nullable(),
});
export type EnvironmentBranch = z.infer<typeof environmentBranchSchema>;

export const rpcContract = defineRpcContract({
  /** Everything the settings screen needs in one call. */
  overview: {
    input: z.null(),
    output: z.object({
      features: featureFlagsSchema,
      preferences: preferencesSchema,
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
      preferences: preferencesSchema,
      /** Every project in BB's order, so the sidebar can apply any sort mode. */
      projects: z.array(projectOrderEntrySchema),
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
  setProjectSort: {
    input: z.object({ projectSort: projectSortSchema }).strict(),
    output: z.object({ preferences: preferencesSchema }),
  },
  /**
   * Manual ordering: place a project immediately before another, or last when
   * `beforeProjectId` is null. Writes BB's own project order.
   */
  moveProject: {
    input: z
      .object({
        projectId: z.string().min(1),
        beforeProjectId: z.string().min(1).nullable(),
      })
      .strict(),
    output: z.object({ projects: z.array(projectOrderEntrySchema) }),
  },
  /** Re-resolve now, ignoring the freshness and backoff rules. */
  refreshIcon: {
    input: z.object({ projectId: z.string().min(1) }).strict(),
    output: z.object({ icon: publicIconSchema }),
  },
  /**
   * Add a project from a folder the user picks on the host. The picker is the
   * host's own native dialog, so the plugin never handles a path by hand; a
   * cancelled pick returns a null project rather than an error.
   */
  addProject: {
    input: z.null(),
    output: z.object({
      projectId: z.string().nullable(),
      name: z.string().nullable(),
    }),
  },
  /**
   * Remove a project from BB, threads and all. Irreversible, so the frontend
   * asks twice — and the personal project is refused outright, here as well as
   * in the menu, because it is not the user's to delete.
   */
  deleteProject: {
    input: z.object({ projectId: z.string().min(1) }).strict(),
    output: z.object({ projects: z.array(projectOrderEntrySchema) }),
  },
  /**
   * The branch facts that decide which threads are stacked on one another.
   * Keyed by environment id, because a branch belongs to an environment and
   * several threads can share one.
   *
   * Read per environment on the host, so this is only called when the
   * stacked-threads feature is on.
   */
  stacks: {
    input: z.object({ environmentIds: z.array(z.string()).max(500) }).strict(),
    output: z.object({
      branches: z.record(z.string(), environmentBranchSchema),
    }),
  },
});
