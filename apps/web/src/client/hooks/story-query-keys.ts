import type { PanelType } from "../lib/panel-visibility";
import type { StoryType } from "../types/story";

export type StoryPanelQueryFilters = {
  searchQuery: string;
  activeOwners: string[];
  activeLabels: string[];
  activeEpicIds: string[];
  activeTypes: StoryType[];
  // Legacy fields kept optional for test compatibility.
  activeOwner?: string | null;
  activeLabel?: string | null;
  showMyWorkOnly?: boolean;
  activeTypeFilter?: "all" | StoryType;
};

export const storyQueryKeys = {
  projectBootstrap: (projectId: string) =>
    ["projects", projectId, "bootstrap"] as const,
  panelStoriesRoot: (projectId: string) =>
    ["projects", projectId, "stories", "panels"] as const,
  panelStories: (
    projectId: string,
    panel: PanelType,
    currentIterationId: string | null,
    filters: StoryPanelQueryFilters,
  ) =>
    [
      ...storyQueryKeys.panelStoriesRoot(projectId),
      panel,
      {
        currentIterationId,
        searchQuery: filters.searchQuery.trim(),
        activeOwners: filters.activeOwners,
        activeLabels: filters.activeLabels,
        activeEpicIds: filters.activeEpicIds,
        activeTypes: filters.activeTypes,
      },
    ] as const,
  storyTimeline: (projectId: string, storyId: string) =>
    ["projects", projectId, "stories", storyId, "timeline"] as const,
  projectStoriesBlockerPicker: (projectId: string, searchQuery: string) =>
    [
      "projects",
      projectId,
      "stories",
      "blocker-picker",
      searchQuery.trim(),
    ] as const,
  storyDetail: (projectId: string, storyId: string) =>
    ["projects", projectId, "stories", storyId, "detail"] as const,
  projectMembers: (projectId: string) =>
    ["projects", projectId, "members"] as const,
  storyAttachments: (projectId: string, storyId: string) =>
    ["projects", projectId, "stories", storyId, "attachments"] as const,
  projectHistory: (projectId: string) =>
    ["projects", projectId, "history"] as const,
};
