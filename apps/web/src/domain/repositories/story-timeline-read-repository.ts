import type { Result } from "neverthrow";
import type { StoryTimelineEntry } from "../entities/story-timeline";

export const STORY_TIMELINE_READ_REPOSITORY_ERROR =
  "STORY_TIMELINE_READ_REPOSITORY_ERROR" as const;

export type StoryTimelineReadRepositoryError =
  typeof STORY_TIMELINE_READ_REPOSITORY_ERROR;

export type ListStoryTimelinePageInput = {
  limit: number;
  before?: { createdAt: string; id: string };
};

export type ListStoryTimelinePageResult = {
  entries: StoryTimelineEntry[];
  hasMore: boolean;
  /** Present when `hasMore`; client passes this as the next "before" cursor (after encoding). */
  nextBefore: { createdAt: string; id: string } | null;
};

export interface StoryTimelineReadRepository {
  listByStoryPage(
    projectId: string,
    storyId: string,
    input: ListStoryTimelinePageInput,
  ): Promise<
    Result<ListStoryTimelinePageResult, StoryTimelineReadRepositoryError>
  >;
}
