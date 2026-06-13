import type { Result } from "neverthrow";
import type { StoryAttachment } from "../entities/story-attachment";

export const STORY_ATTACHMENT_REPOSITORY_ERROR =
  "STORY_ATTACHMENT_REPOSITORY_ERROR" as const;

export const STORY_ATTACHMENT_NOT_FOUND_ERROR =
  "STORY_ATTACHMENT_NOT_FOUND_ERROR" as const;

export type StoryAttachmentRepositoryError =
  | typeof STORY_ATTACHMENT_REPOSITORY_ERROR
  | typeof STORY_ATTACHMENT_NOT_FOUND_ERROR;

export type CreateStoryAttachmentInput = {
  projectId: string;
  storyId: string;
  fileName: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
};

export interface StoryAttachmentRepository {
  listByStory(
    projectId: string,
    storyId: string,
  ): Promise<Result<StoryAttachment[], StoryAttachmentRepositoryError>>;

  create(
    input: CreateStoryAttachmentInput,
  ): Promise<Result<StoryAttachment, StoryAttachmentRepositoryError>>;

  findById(
    projectId: string,
    storyId: string,
    attachmentId: string,
  ): Promise<Result<StoryAttachment | null, StoryAttachmentRepositoryError>>;

  delete(
    projectId: string,
    storyId: string,
    attachmentId: string,
  ): Promise<Result<void, StoryAttachmentRepositoryError>>;
}
