import type { StoryStatus, StoryType } from "./story";

export type SavedFilterVisibility = "private" | "project";

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
  __typename: "SavedFilter";
  id: string;
  projectId: string;
  ownerUserId: string;
  name: string;
  filters: SavedFilterConditions;
  visibility: SavedFilterVisibility;
  createdAt: string;
  updatedAt: string;
};
