import type { Result } from "neverthrow";
import type { StoryComment } from "../../domain/entities/story-timeline";
import type {
  StoryCommentRepository,
  StoryCommentRepositoryError,
} from "../../domain/repositories/story-comment-repository";

export type CreateStoryCommentError = StoryCommentRepositoryError;

export async function createStoryComment(
  repository: StoryCommentRepository,
  input: {
    projectId: string;
    storyId: string;
    userId: string;
    actorName: string;
    body: string;
  },
): Promise<Result<StoryComment, CreateStoryCommentError>> {
  return repository.create(input.projectId, input.storyId, {
    userId: input.userId,
    actorName: input.actorName,
    body: input.body,
  });
}
