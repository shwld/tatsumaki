import { err, ok, type Result } from "neverthrow";
import type {
  StoryAttachmentRepository,
  StoryAttachmentRepositoryError,
} from "../../domain/repositories/story-attachment-repository";
import {
  STORY_ATTACHMENT_NOT_FOUND_ERROR,
  STORY_ATTACHMENT_REPOSITORY_ERROR,
} from "../../domain/repositories/story-attachment-repository";
import type { StoryAttachmentObjectStore } from "../ports/story-attachment-object-store";

export const STORY_ATTACHMENT_DELETE_ERROR =
  "STORY_ATTACHMENT_DELETE_ERROR" as const;

export type DeleteStoryAttachmentError =
  | StoryAttachmentRepositoryError
  | typeof STORY_ATTACHMENT_DELETE_ERROR;

export async function deleteStoryAttachment(
  repository: StoryAttachmentRepository,
  objectStore: StoryAttachmentObjectStore,
  input: { projectId: string; storyId: string; attachmentId: string },
): Promise<Result<void, DeleteStoryAttachmentError>> {
  const attachment = await repository.findById(
    input.projectId,
    input.storyId,
    input.attachmentId,
  );

  if (attachment.isErr()) {
    if (attachment.error === STORY_ATTACHMENT_NOT_FOUND_ERROR) {
      return err(STORY_ATTACHMENT_NOT_FOUND_ERROR);
    }

    return err(STORY_ATTACHMENT_REPOSITORY_ERROR);
  }

  if (!attachment.value) {
    return err(STORY_ATTACHMENT_NOT_FOUND_ERROR);
  }

  try {
    await objectStore.delete(attachment.value.fileKey);
  } catch {
    return err(STORY_ATTACHMENT_DELETE_ERROR);
  }

  const deleted = await repository.delete(
    input.projectId,
    input.storyId,
    input.attachmentId,
  );
  if (deleted.isErr()) {
    if (deleted.error === STORY_ATTACHMENT_NOT_FOUND_ERROR) {
      return err(STORY_ATTACHMENT_NOT_FOUND_ERROR);
    }
    return err(STORY_ATTACHMENT_REPOSITORY_ERROR);
  }

  return ok(undefined);
}
