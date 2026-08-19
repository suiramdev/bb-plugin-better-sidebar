/** Shared fixtures: a complete `PluginSidebarThread` is 20 fields of noise. */
import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

export function makeThread(
  overrides: Partial<PluginSidebarThread> & { id: string },
): PluginSidebarThread {
  return {
    projectId: "proj_1",
    title: overrides.id,
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "claude-code",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 1_000,
    updatedAt: 1_000,
    lastReadAt: null,
    latestAttentionAt: 1_000,
    ...overrides,
  };
}

export function makeProject(
  overrides: Partial<PluginSidebarProject> & { id: string },
): PluginSidebarProject {
  return { name: overrides.id, isPersonal: false, ...overrides };
}
