import { err, ok, type Result } from "neverthrow";
import type { StoryAttachment } from "../../domain/entities/story-attachment";
import type {
  StoryAttachmentRepository,
  StoryAttachmentRepositoryError,
} from "../../domain/repositories/story-attachment-repository";
import {
  STORY_ATTACHMENT_NOT_FOUND_ERROR,
  STORY_ATTACHMENT_REPOSITORY_ERROR,
} from "../../domain/repositories/story-attachment-repository";
import type {
  StoredStoryAttachmentObject,
  StoryAttachmentObjectStore,
} from "../ports/story-attachment-object-store";

export const STORY_ATTACHMENT_OBJECT_NOT_FOUND_ERROR =
  "STORY_ATTACHMENT_OBJECT_NOT_FOUND_ERROR" as const;

export const STORY_ATTACHMENT_DOWNLOAD_ERROR =
  "STORY_ATTACHMENT_DOWNLOAD_ERROR" as const;

export type GetStoryAttachmentContentError =
  | StoryAttachmentRepositoryError
  | typeof STORY_ATTACHMENT_OBJECT_NOT_FOUND_ERROR
  | typeof STORY_ATTACHMENT_DOWNLOAD_ERROR;

export type StoryAttachmentContent = {
  attachment: StoryAttachment;
  object: StoredStoryAttachmentObject;
};

export async function getStoryAttachmentContent(
  repository: StoryAttachmentRepository,
  objectStore: StoryAttachmentObjectStore,
  input: { projectId: string; storyId: string; attachmentId: string },
): Promise<Result<StoryAttachmentContent, GetStoryAttachmentContentError>> {
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
    const object = await objectStore.get(attachment.value.fileKey);
    if (!object) {
      return err(STORY_ATTACHMENT_OBJECT_NOT_FOUND_ERROR);
    }

    return ok({
      attachment: attachment.value,
      object,
    });
  } catch {
    return err(STORY_ATTACHMENT_DOWNLOAD_ERROR);
  }
}
