import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import {
  requiresEstimateForTransition,
  type Story,
  type StoryStatus,
} from "../../domain/entities/story";
import type {
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";
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
import type { StoryActivityField } from "../../domain/entities/story-timeline";
import { createAssigneeStoryActivityNotifications } from "./create-assignee-story-activity-notifications";
import type {
  NotificationRepository,
  NotificationRepositoryError,
} from "../../domain/repositories/notification-repository";
import type {
  RecordStoryActivityInput,
  StoryActivityRepository,
  StoryActivityRepositoryError,
} from "../../domain/repositories/story-activity-repository";

export const STORY_NOT_FOUND_ERROR = "STORY_NOT_FOUND_ERROR" as const;
export const NO_STORY_FIELDS_TO_UPDATE_ERROR =
  "NO_STORY_FIELDS_TO_UPDATE_ERROR" as const;

export type InvalidStoryStatusTransitionError = {
  code: "INVALID_STORY_STATUS_TRANSITION_ERROR";
  from: StoryStatus;
  to: StoryStatus;
  allowedNext: StoryStatus[];
};

export type EstimateRequiredError = {
  code: "ESTIMATE_REQUIRED_ERROR";
  targetStatus: StoryStatus;
};

export type UpdateStoryError =
  | typeof STORY_NOT_FOUND_ERROR
  | typeof NO_STORY_FIELDS_TO_UPDATE_ERROR
  | typeof INVALID_STORY_TITLE_ERROR
  | typeof INVALID_STORY_TYPE_ERROR
  | typeof INVALID_STORY_STATUS_ERROR
  | typeof INVALID_STORY_LABELS_ERROR
  | typeof INVALID_STORY_POINT_ERROR
  | typeof INVALID_STORY_OWNER_IDS_ERROR
  | typeof INVALID_STORY_EPIC_ID_ERROR
  | typeof INVALID_STORY_IS_ICEBOX_ERROR
  | typeof INVALID_STORY_REQUESTER_ID_ERROR
  | InvalidStoryStatusTransitionError
  | EstimateRequiredError
  | StoryActivityRepositoryError
  | StoryRepositoryError
  | NotificationRepositoryError;

type StoryUpdateActor = {
  id: string;
  name: string;
};

function serializeStoryFieldValue(
  fieldName: StoryActivityField,
  story: Story,
): string | null {
  switch (fieldName) {
    case "title":
      return story.title;
    case "description":
      return story.description;
    case "type":
      return story.type;
    case "status":
      return story.status;
    case "storyPoint":
      return story.storyPoint === null ? null : String(story.storyPoint);
    case "labels":
      return JSON.stringify(story.labels);
    case "story":
      return story.title;
  }
}

function buildStoryActivities(params: {
  before: Story;
  after: Story;
  actor: StoryUpdateActor;
}): RecordStoryActivityInput[] {
  const fields: StoryActivityField[] = [
    "title",
    "description",
    "type",
    "status",
    "storyPoint",
    "labels",
  ];

  return fields.flatMap((fieldName) => {
    const oldValue = serializeStoryFieldValue(fieldName, params.before);
    const newValue = serializeStoryFieldValue(fieldName, params.after);

    if (oldValue === newValue) {
      return [];
    }

    return [
      {
        projectId: params.before.projectId,
        storyId: params.after.id,
        actorUserId: params.actor.id,
        actorName: params.actor.name,
        action: "field_changed",
        fieldName,
        oldValue,
        newValue,
      },
    ];
  });
}

export async function updateStory(
  repository: StoryRepository,
  activityRepository: StoryActivityRepository,
  input: {
    projectId: string;
    id: string;
    title?: string;
    description?: string;
    type?: string;
    status?: string;
    storyPoint?: number | null;
    labels?: string[];
    ownerIds?: string[];
    epicId?: string | null;
    isIcebox?: boolean;
    requesterId?: string | null;
    allowedStoryPoints?: number[];
    actor: StoryUpdateActor;
  },
  options?: {
    notificationRepository?: NotificationRepository;
  },
): Promise<Result<Story, UpdateStoryError>> {
  const hasUpdates =
    input.title !== undefined ||
    input.description !== undefined ||
    input.type !== undefined ||
    input.status !== undefined ||
    input.storyPoint !== undefined ||
    input.labels !== undefined ||
    input.ownerIds !== undefined ||
    input.epicId !== undefined ||
    input.isIcebox !== undefined ||
    input.requesterId !== undefined;

  if (!hasUpdates) {
    return err(NO_STORY_FIELDS_TO_UPDATE_ERROR);
  }

  const currentResult = await repository.findById(input.projectId, input.id);
  if (currentResult.isErr()) {
    return err(currentResult.error);
  }
  if (!currentResult.value) {
    return err(STORY_NOT_FOUND_ERROR);
  }

  const normalizedTitle =
    input.title !== undefined ? normalizeStoryTitle(input.title) : undefined;
  if (normalizedTitle?.isErr()) {
    return err(normalizedTitle.error);
  }

  const normalizedDescription =
    input.description !== undefined
      ? normalizeStoryDescription(input.description)
      : undefined;

  const normalizedType =
    input.type !== undefined ? normalizeStoryType(input.type) : undefined;
  if (normalizedType?.isErr()) {
    return err(normalizedType.error);
  }

  const normalizedStatus =
    input.status !== undefined ? normalizeStoryStatus(input.status) : undefined;
  if (normalizedStatus?.isErr()) {
    return err(normalizedStatus.error);
  }

  const normalizedStoryPoint =
    input.storyPoint !== undefined
      ? normalizeStoryPoint(input.storyPoint, input.allowedStoryPoints)
      : undefined;
  if (normalizedStoryPoint?.isErr()) {
    return err(normalizedStoryPoint.error);
  }

  // Use the incoming storyPoint if provided, otherwise fall back to the current value
  const effectiveStoryPoint = normalizedStoryPoint?.isOk()
    ? normalizedStoryPoint.value
    : currentResult.value.storyPoint;

  if (
    normalizedStatus?.isOk() &&
    requiresEstimateForTransition(
      normalizedStatus.value,
      effectiveStoryPoint,
      currentResult.value.type,
    )
  ) {
    return err({
      code: "ESTIMATE_REQUIRED_ERROR",
      targetStatus: normalizedStatus.value,
    });
  }

  const normalizedLabels =
    input.labels !== undefined ? normalizeStoryLabels(input.labels) : undefined;
  if (normalizedLabels?.isErr()) {
    return err(normalizedLabels.error);
  }

  const normalizedOwnerIds =
    input.ownerIds !== undefined
      ? normalizeStoryOwnerIds(input.ownerIds)
      : undefined;
  if (normalizedOwnerIds?.isErr()) {
    return err(normalizedOwnerIds.error);
  }

  const normalizedRequesterId =
    input.requesterId !== undefined
      ? normalizeStoryRequesterId(input.requesterId)
      : undefined;
  if (normalizedRequesterId?.isErr()) {
    return err(normalizedRequesterId.error);
  }

  const normalizedEpicId =
    input.epicId !== undefined ? normalizeStoryEpicId(input.epicId) : undefined;
  if (normalizedEpicId?.isErr()) {
    return err(normalizedEpicId.error);
  }

  const normalizedIsIcebox =
    input.isIcebox !== undefined
      ? normalizeStoryIsIcebox(input.isIcebox, {
          iterationId: currentResult.value.iterationId,
          status: normalizedStatus?.isOk()
            ? normalizedStatus.value
            : currentResult.value.status,
        })
      : undefined;
  if (normalizedIsIcebox?.isErr()) {
    return err(normalizedIsIcebox.error);
  }

  const result = await repository.update({
    projectId: input.projectId,
    id: input.id,
    ...(normalizedTitle?.isOk() ? { title: normalizedTitle.value } : {}),
    ...(normalizedDescription !== undefined
      ? { description: normalizedDescription }
      : {}),
    ...(normalizedType?.isOk() ? { type: normalizedType.value } : {}),
    ...(normalizedStatus?.isOk() ? { status: normalizedStatus.value } : {}),
    ...(normalizedStoryPoint?.isOk()
      ? { storyPoint: normalizedStoryPoint.value }
      : {}),
    ...(normalizedLabels?.isOk() ? { labels: normalizedLabels.value } : {}),
    ...(normalizedOwnerIds?.isOk()
      ? { ownerIds: normalizedOwnerIds.value }
      : {}),
    ...(normalizedEpicId?.isOk() ? { epicId: normalizedEpicId.value } : {}),
    ...(normalizedIsIcebox?.isOk()
      ? { isIcebox: normalizedIsIcebox.value }
      : {}),
    ...(normalizedRequesterId?.isOk()
      ? { requesterId: normalizedRequesterId.value }
      : {}),
  });

  if (result.isErr()) {
    return err(result.error);
  }

  if (!result.value) {
    return err(STORY_NOT_FOUND_ERROR);
  }

  const activities: RecordStoryActivityInput[] = buildStoryActivities({
    before: currentResult.value,
    after: result.value,
    actor: input.actor,
  }).map((activity) => ({
    ...activity,
    id: ulid(),
  }));
  const activityResult = await activityRepository.recordMany(activities);
  if (activityResult.isErr()) {
    return err(activityResult.error);
  }

  if (
    options?.notificationRepository &&
    activities.length > 0 &&
    result.value.ownerIds.length > 0
  ) {
    const notifyResult = await createAssigneeStoryActivityNotifications(
      options.notificationRepository,
      {
        projectId: input.projectId,
        storyId: result.value.id,
        storyTitle: result.value.title,
        ownerIds: result.value.ownerIds,
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        activityIds: activities.map((row) => row.id!),
        createdAt: result.value.updatedAt,
      },
    );
    if (notifyResult.isErr()) {
      return err(notifyResult.error);
    }
  }

  return ok(result.value);
}
