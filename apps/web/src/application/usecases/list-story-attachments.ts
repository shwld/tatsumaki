import type { Result } from "neverthrow";
import type { StoryAttachment } from "../../domain/entities/story-attachment";
import type {
  StoryAttachmentRepository,
  StoryAttachmentRepositoryError,
} from "../../domain/repositories/story-attachment-repository";

export type ListStoryAttachmentsError = StoryAttachmentRepositoryError;

export async function listStoryAttachments(
  repository: StoryAttachmentRepository,
  input: { projectId: string; storyId: string },
): Promise<Result<StoryAttachment[], ListStoryAttachmentsError>> {
  return repository.listByStory(input.projectId, input.storyId);
}
