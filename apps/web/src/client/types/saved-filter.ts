import type { StoryStatus, StoryType } from "./story";

export type SavedFilterConditions = {
  query?: string;
  types?: StoryType[];
  unestimatedOnly?: boolean;
  statuses?: StoryStatus[];
  ownerIds?: string[];
  labels?: string[];
  epicIds?: string[];
};

export type SavedFilter = {
  id: string;
  projectId: string;
  ownerUserId: string;
  name: string;
  filters: SavedFilterConditions;
  visibility: "private" | "project";
  createdAt: string;
  updatedAt: string;
};

export type SavedFiltersResponse = {
  savedFilters: SavedFilter[];
};

export type SavedFilterResponse = {
  savedFilter: SavedFilter;
};
