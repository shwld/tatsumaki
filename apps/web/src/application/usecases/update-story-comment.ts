import { err, type Result } from "neverthrow";
import type { StoryComment } from "../../domain/entities/story-timeline";
import type {
  StoryCommentRepository,
  StoryCommentRepositoryError,
} from "../../domain/repositories/story-comment-repository";

export const COMMENT_NOT_FOUND_ERROR = "COMMENT_NOT_FOUND_ERROR" as const;
export const COMMENT_FORBIDDEN_ERROR = "COMMENT_FORBIDDEN_ERROR" as const;

export type UpdateStoryCommentError =
  | typeof COMMENT_NOT_FOUND_ERROR
  | typeof COMMENT_FORBIDDEN_ERROR
  | StoryCommentRepositoryError;

export async function updateStoryComment(
  repository: StoryCommentRepository,
  input: {
    projectId: string;
    commentId: string;
    userId: string;
    body: string;
  },
): Promise<Result<StoryComment, UpdateStoryCommentError>> {
  const existing = await repository.findById(input.projectId, input.commentId);
  if (existing.isErr()) {
    return err(existing.error);
  }
  if (!existing.value) {
    return err(COMMENT_NOT_FOUND_ERROR);
  }
  if (existing.value.userId !== input.userId) {
    return err(COMMENT_FORBIDDEN_ERROR);
  }

  return repository.update(input.projectId, input.commentId, {
    body: input.body,
  });
}
