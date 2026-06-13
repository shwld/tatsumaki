import { err, ok, type Result } from "neverthrow";
import type { Story } from "../../domain/entities/story";
import type {
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";
import type {
  StoryActivityRepository,
  StoryActivityRepositoryError,
} from "../../domain/repositories/story-activity-repository";
import type { NotificationRepository } from "../../domain/repositories/notification-repository";
import {
  INVALID_STORY_LABELS_ERROR,
  normalizeStoryLabels,
} from "./story-input";
import {
  STORY_NOT_FOUND_ERROR,
  type UpdateStoryError,
  updateStory,
} from "./update-story";

export const EMPTY_STORY_IDS_ERROR = "EMPTY_STORY_IDS_ERROR" as const;
export const EMPTY_LABELS_ERROR = "EMPTY_LABELS_ERROR" as const;

type StoryUpdateActor = {
  id: string;
  name: string;
};

export type BulkAddStoryLabelsError =
  | typeof EMPTY_STORY_IDS_ERROR
  | typeof EMPTY_LABELS_ERROR
  | UpdateStoryError
  | typeof INVALID_STORY_LABELS_ERROR
  | typeof STORY_NOT_FOUND_ERROR
  | StoryRepositoryError
  | StoryActivityRepositoryError;

function uniqueStoryIds(storyIds: string[]): string[] {
  return Array.from(new Set(storyIds));
}

function mergeLabels(current: string[], labelsToAdd: string[]): string[] {
  return Array.from(new Set([...current, ...labelsToAdd]));
}

export async function bulkAddStoryLabels(
  repository: StoryRepository,
  activityRepository: StoryActivityRepository,
  input: {
    projectId: string;
    storyIds: string[];
    labels: string[];
    actor: StoryUpdateActor;
  },
  options?: {
    notificationRepository?: NotificationRepository;
  },
): Promise<Result<Story[], BulkAddStoryLabelsError>> {
  const storyIds = uniqueStoryIds(input.storyIds);

  if (storyIds.length === 0) {
    return err(EMPTY_STORY_IDS_ERROR);
  }

  if (input.labels.length === 0) {
    return err(EMPTY_LABELS_ERROR);
  }

  const normalizedLabels = normalizeStoryLabels(input.labels);
  if (normalizedLabels.isErr()) {
    return err(normalizedLabels.error);
  }

  const labelsToAdd = normalizedLabels.value;
  const updatedStories: Story[] = [];

  for (const storyId of storyIds) {
    const currentResult = await repository.findById(input.projectId, storyId);
    if (currentResult.isErr()) {
      return err(currentResult.error);
    }

    const current = currentResult.value;
    if (!current) {
      return err(STORY_NOT_FOUND_ERROR);
    }

    const updateResult = await updateStory(
      repository,
      activityRepository,
      {
        projectId: input.projectId,
        id: storyId,
        labels: mergeLabels(current.labels, labelsToAdd),
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
