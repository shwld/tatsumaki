import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import { DEFAULT_STORY_POINTS } from "../../domain/entities/story";
import type { Story } from "../../domain/entities/story";
import type {
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";
import type {
  StoryActivityRepository,
  StoryActivityRepositoryError,
} from "../../domain/repositories/story-activity-repository";
import {
  INVALID_STORY_LABELS_ERROR,
  INVALID_STORY_POINT_ERROR,
  INVALID_STORY_OWNER_IDS_ERROR,
  INVALID_STORY_EPIC_ID_ERROR,
  INVALID_STORY_IS_ICEBOX_ERROR,
  INVALID_STORY_REQUESTER_ID_ERROR,
  INVALID_STORY_STATUS_ERROR,
  INVALID_STORY_TITLE_ERROR,
  INVALID_STORY_TYPE_ERROR,
  normalizeStoryDescription,
  normalizeStoryLabels,
  normalizeStoryPoint,
  normalizeStoryOwnerIds,
  normalizeStoryEpicId,
  normalizeStoryIsIcebox,
  normalizeStoryRequesterId,
  normalizeStoryStatus,
  normalizeStoryTitle,
  normalizeStoryType,
} from "./story-input";
import { createAssigneeStoryActivityNotifications } from "./create-assignee-story-activity-notifications";
import type {
  NotificationRepository,
  NotificationRepositoryError,
} from "../../domain/repositories/notification-repository";

export type CreateStoryError =
  | typeof INVALID_STORY_TITLE_ERROR
  | typeof INVALID_STORY_TYPE_ERROR
  | typeof INVALID_STORY_STATUS_ERROR
  | typeof INVALID_STORY_LABELS_ERROR
  | typeof INVALID_STORY_POINT_ERROR
  | typeof INVALID_STORY_OWNER_IDS_ERROR
  | typeof INVALID_STORY_EPIC_ID_ERROR
  | typeof INVALID_STORY_IS_ICEBOX_ERROR
  | typeof INVALID_STORY_REQUESTER_ID_ERROR
  | StoryRepositoryError
  | StoryActivityRepositoryError
  | NotificationRepositoryError;

export async function createStory(
  repository: StoryRepository,
  activityRepository: StoryActivityRepository,
  input: {
    projectId: string;
    title: string;
    description: string;
    type: string;
    status: string;
    storyPoint: number | null;
    labels: string[];
    epicId?: string | null;
    isIcebox?: boolean;
    ownerIds?: string[];
    requesterId?: string | null;
    releaseDate?: string | null;
    allowedStoryPoints?: number[];
    actorUserId: string;
    actorName: string;
  },
  options?: {
    notificationRepository?: NotificationRepository;
  },
): Promise<Result<Story, CreateStoryError>> {
  const titleResult = normalizeStoryTitle(input.title);
  if (titleResult.isErr()) {
    return err(titleResult.error);
  }

  const typeResult = normalizeStoryType(input.type);
  if (typeResult.isErr()) {
    return err(typeResult.error);
  }

  const description = normalizeStoryDescription(input.description);

  const statusResult = normalizeStoryStatus(input.status);
  if (statusResult.isErr()) {
    return err(statusResult.error);
  }

  const labelsResult = normalizeStoryLabels(input.labels);
  if (labelsResult.isErr()) {
    return err(labelsResult.error);
  }

  const storyPointResult = normalizeStoryPoint(
    input.storyPoint,
    input.allowedStoryPoints ?? DEFAULT_STORY_POINTS,
  );
  if (storyPointResult.isErr()) {
    return err(storyPointResult.error);
  }

  const ownerIdsResult = normalizeStoryOwnerIds(input.ownerIds ?? []);
  if (ownerIdsResult.isErr()) {
    return err(ownerIdsResult.error);
  }

  const requesterIdResult = normalizeStoryRequesterId(
    input.requesterId ?? null,
  );
  if (requesterIdResult.isErr()) {
    return err(requesterIdResult.error);
  }

  const epicIdResult = normalizeStoryEpicId(input.epicId ?? null);
  if (epicIdResult.isErr()) {
    return err(epicIdResult.error);
  }

  const isIceboxResult = normalizeStoryIsIcebox(input.isIcebox ?? false);
  if (isIceboxResult.isErr()) {
    return err(isIceboxResult.error);
  }

  const result = await repository.create({
    projectId: input.projectId,
    title: titleResult.value,
    description,
    type: typeResult.value,
    status: statusResult.value,
    storyPoint: storyPointResult.value,
    labels: labelsResult.value,
    epicId: epicIdResult.value,
    isIcebox: isIceboxResult.value,
    ownerIds: ownerIdsResult.value,
    requesterId: requesterIdResult.value,
    releaseDate: input.releaseDate ?? null,
  });

  if (result.isErr()) {
    return err(result.error);
  }

  const createdActivityId = ulid();
  const activityResult = await activityRepository.recordMany([
    {
      id: createdActivityId,
      projectId: input.projectId,
      storyId: result.value.id,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      action: "created",
      fieldName: "story",
      oldValue: null,
      newValue: result.value.title,
    },
  ]);

  if (activityResult.isErr()) {
    return err(activityResult.error);
  }

  if (options?.notificationRepository && result.value.ownerIds.length > 0) {
    const notifyResult = await createAssigneeStoryActivityNotifications(
      options.notificationRepository,
      {
        projectId: input.projectId,
        storyId: result.value.id,
        storyTitle: result.value.title,
        ownerIds: result.value.ownerIds,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        activityIds: [createdActivityId],
        createdAt: result.value.updatedAt,
      },
    );
    if (notifyResult.isErr()) {
      return err(notifyResult.error);
    }
  }

  return ok(result.value);
}
