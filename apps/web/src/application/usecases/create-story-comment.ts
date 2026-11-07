import type { Result } from "neverthrow";
import type { StoryComment } from "../../domain/entities/story-timeline";
import type {
  StoryCommentRepository,
  StoryCommentRepositoryError,
} from "../../domain/repositories/story-comment-repository";
import { buildAssigneeCommentNotifications } from "./create-assignee-comment-notifications";
import { buildMentionNotifications } from "./create-mention-notifications";

export type CreateStoryCommentError = StoryCommentRepositoryError;

export async function createStoryComment(
  repository: StoryCommentRepository,
  input: {
    projectId: string;
    storyId: string;
    userId: string;
    actorName: string;
    body: string;
    /** 指定するとコメントと同一トランザクションで通知を保存する(失敗時はコメントも残らず再送できる)。 */
    notify?: {
      storyTitle: string;
      ownerIds: string[];
      /** 指定した場合のみメンション通知を作る。 */
      memberUserIds?: string[];
    };
  },
): Promise<Result<StoryComment, CreateStoryCommentError>> {
  const { notify } = input;
  return repository.create(input.projectId, input.storyId, {
    userId: input.userId,
    actorName: input.actorName,
    body: input.body,
    notifications: notify
      ? (comment) => [
          ...(notify.memberUserIds
            ? buildMentionNotifications({
                projectId: input.projectId,
                storyId: input.storyId,
                storyTitle: notify.storyTitle,
                actorUserId: input.userId,
                actorName: input.actorName,
                sourceType: "comment",
                sourceId: comment.id,
                text: comment.body,
                memberUserIds: notify.memberUserIds,
                createdAt: comment.createdAt,
              })
            : []),
          ...buildAssigneeCommentNotifications({
            projectId: input.projectId,
            storyId: input.storyId,
            storyTitle: notify.storyTitle,
            ownerIds: notify.ownerIds,
            actorUserId: input.userId,
            actorName: input.actorName,
            commentId: comment.id,
            commentBody: comment.body,
            createdAt: comment.createdAt,
          }),
        ]
      : undefined,
  });
}
