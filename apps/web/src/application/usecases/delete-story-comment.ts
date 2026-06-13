import { err, ok, type Result } from "neverthrow";
import type {
  StoryCommentRepository,
  StoryCommentRepositoryError,
} from "../../domain/repositories/story-comment-repository";

export const COMMENT_NOT_FOUND_ERROR = "COMMENT_NOT_FOUND_ERROR" as const;
export const COMMENT_FORBIDDEN_ERROR = "COMMENT_FORBIDDEN_ERROR" as const;

export type DeleteStoryCommentError =
  | typeof COMMENT_NOT_FOUND_ERROR
  | typeof COMMENT_FORBIDDEN_ERROR
  | StoryCommentRepositoryError;

export async function deleteStoryComment(
  repository: StoryCommentRepository,
  input: {
    projectId: string;
    commentId: string;
    userId: string;
  },
): Promise<Result<true, DeleteStoryCommentError>> {
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

  const result = await repository.delete(input.projectId, input.commentId);
  if (result.isErr()) {
    return err(result.error);
  }

  return ok(true);
}
