import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import { createAssigneeStoryActivityNotifications } from "./create-assignee-story-activity-notifications";
import type {
  NotificationRepository,
  NotificationRepositoryError,
} from "../../domain/repositories/notification-repository";
import type {
  StoryRepository,
  StoryRepositoryError,
} from "../../domain/repositories/story-repository";
import type {
  StoryActivityRepository,
  StoryActivityRepositoryError,
} from "../../domain/repositories/story-activity-repository";
import type {
  StoryCommentRepository,
  StoryCommentRepositoryError,
} from "../../domain/repositories/story-comment-repository";

export const STORY_NOT_FOUND_ERROR = "STORY_NOT_FOUND_ERROR" as const;

export type DeleteStoryError =
  | typeof STORY_NOT_FOUND_ERROR
  | StoryRepositoryError
  | StoryActivityRepositoryError
  | StoryCommentRepositoryError
  | NotificationRepositoryError;

/** 削除時のタイムライン挙動は docs/story-delete-and-timeline-entries.md を参照。 */
export async function deleteStory(
  repository: StoryRepository,
  activityRepository: StoryActivityRepository,
  commentRepository: StoryCommentRepository,
  input: {
    projectId: string;
    storyId: string;
    actorUserId: string;
    actorName: string;
  },
  options?: {
    notificationRepository?: NotificationRepository;
  },
): Promise<Result<true, DeleteStoryError>> {
  const storyResult = await repository.findById(input.projectId, input.storyId);
  if (storyResult.isErr()) {
    return err(storyResult.error);
  }
  if (!storyResult.value) {
    return err(STORY_NOT_FOUND_ERROR);
  }

  const storyTitle = storyResult.value.title;
  const ownerIds = storyResult.value.ownerIds;
  const deletedActivityId = ulid();
  const deletedAt = new Date().toISOString();

  const [activityResult, deleteCommentsResult] = await Promise.all([
    activityRepository.recordMany([
      {
        id: deletedActivityId,
        projectId: input.projectId,
        storyId: input.storyId,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        action: "deleted",
        fieldName: "story",
        oldValue: storyTitle,
        newValue: null,
      },
    ]),
    commentRepository.deleteAllForStory(input.projectId, input.storyId),
  ]);

  if (activityResult.isErr()) {
    return err(activityResult.error);
  }
  if (deleteCommentsResult.isErr()) {
    return err(deleteCommentsResult.error);
  }

  if (options?.notificationRepository && ownerIds.length > 0) {
    const notifyResult = await createAssigneeStoryActivityNotifications(
      options.notificationRepository,
      {
        projectId: input.projectId,
        storyId: null,
        storyTitle,
        ownerIds,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        activityIds: [deletedActivityId],
        createdAt: deletedAt,
      },
    );
    if (notifyResult.isErr()) {
      return err(notifyResult.error);
    }
  }

  const result = await repository.delete(input.projectId, input.storyId);

  if (result.isErr()) {
    return err(result.error);
  }

  if (!result.value) {
    return err(STORY_NOT_FOUND_ERROR);
  }

  return ok(true);
}
