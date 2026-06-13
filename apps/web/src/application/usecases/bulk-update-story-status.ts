import { err, ok, type Result } from "neverthrow";
import { type Story } from "../../domain/entities/story";
import type {
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";
import {
  INVALID_STORY_STATUS_ERROR,
  normalizeStoryStatus,
} from "./story-input";
import {
  type InvalidStoryStatusTransitionError,
  STORY_NOT_FOUND_ERROR,
  type UpdateStoryError,
  updateStory,
} from "./update-story";
import type {
  StoryActivityRepository,
  StoryActivityRepositoryError,
} from "../../domain/repositories/story-activity-repository";
import type { NotificationRepository } from "../../domain/repositories/notification-repository";

export const EMPTY_STORY_IDS_ERROR = "EMPTY_STORY_IDS_ERROR" as const;

type StoryUpdateActor = {
  id: string;
  name: string;
};

export type BulkUpdateStoryStatusError =
  | typeof EMPTY_STORY_IDS_ERROR
  | UpdateStoryError
  | typeof INVALID_STORY_STATUS_ERROR
  | typeof STORY_NOT_FOUND_ERROR
  | InvalidStoryStatusTransitionError
  | StoryRepositoryError
  | StoryActivityRepositoryError;

function uniqueStoryIds(storyIds: string[]): string[] {
  return Array.from(new Set(storyIds));
}

export async function bulkUpdateStoryStatus(
  repository: StoryRepository,
  activityRepository: StoryActivityRepository,
  input: {
    projectId: string;
    storyIds: string[];
    status: string;
    actor: StoryUpdateActor;
  },
  options?: {
    notificationRepository?: NotificationRepository;
  },
): Promise<Result<Story[], BulkUpdateStoryStatusError>> {
  const storyIds = uniqueStoryIds(input.storyIds);

  if (storyIds.length === 0) {
    return err(EMPTY_STORY_IDS_ERROR);
  }

  const normalizedStatus = normalizeStoryStatus(input.status);
  if (normalizedStatus.isErr()) {
    return err(normalizedStatus.error);
  }

  const targetStatus = normalizedStatus.value;

  for (const storyId of storyIds) {
    const storyResult = await repository.findById(input.projectId, storyId);
    if (storyResult.isErr()) {
      return err(storyResult.error);
    }

    const story = storyResult.value;
    if (!story) {
      return err(STORY_NOT_FOUND_ERROR);
    }
  }

  const updatedStories: Story[] = [];

  for (const storyId of storyIds) {
    const updateResult = await updateStory(
      repository,
      activityRepository,
      {
        projectId: input.projectId,
        id: storyId,
        status: targetStatus,
        actor: input.actor,
      },
      options,
    );

    if (updateResult.isErr()) {
      return err(updateResult.error);
    }

    updatedStories.push(updateResult.value);
  }

  return ok(updatedStories);
}
