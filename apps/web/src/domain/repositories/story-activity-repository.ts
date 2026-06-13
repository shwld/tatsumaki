import type { Result } from "neverthrow";
import type {
  ProjectHistoryEntry,
  StoryActivity,
  StoryActivityAction,
  StoryActivityField,
} from "../entities/story-timeline";

export type RecordStoryActivityInput = {
  /** When set, stored as the timeline row id (for notification dedupe keys). */
  id?: string;
  projectId: string;
  storyId: string;
  actorUserId: string;
  actorName: string;
  action: StoryActivityAction;
  fieldName: StoryActivityField;
  oldValue: string | null;
  newValue: string | null;
};

export const STORY_ACTIVITY_REPOSITORY_ERROR =
  "STORY_ACTIVITY_REPOSITORY_ERROR" as const;

export type StoryActivityRepositoryError =
  typeof STORY_ACTIVITY_REPOSITORY_ERROR;

export type ProjectHistoryPage = {
  entries: ProjectHistoryEntry[];
  hasMore: boolean;
  nextBefore: { createdAt: string; id: string } | null;
};

export interface StoryActivityRepository {
  recordMany(
    activities: RecordStoryActivityInput[],
  ): Promise<Result<void, StoryActivityRepositoryError>>;
  listByStory(
    projectId: string,
    storyId: string,
  ): Promise<Result<StoryActivity[], StoryActivityRepositoryError>>;
  listByProject(
    projectId: string,
    options?: {
      limit: number;
      before?: { createdAt: string; id: string };
    },
  ): Promise<Result<ProjectHistoryPage, StoryActivityRepositoryError>>;
}
