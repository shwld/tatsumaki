import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type { StoryAttachment } from "../../domain/entities/story-attachment";
import type {
  StoryAttachmentRepository,
  StoryAttachmentRepositoryError,
} from "../../domain/repositories/story-attachment-repository";
import {
  STORY_ATTACHMENT_NOT_FOUND_ERROR,
  STORY_ATTACHMENT_REPOSITORY_ERROR,
} from "../../domain/repositories/story-attachment-repository";
import type { StoryAttachmentObjectStore } from "../ports/story-attachment-object-store";

export const STORY_ATTACHMENT_UPLOAD_ERROR =
  "STORY_ATTACHMENT_UPLOAD_ERROR" as const;

export type UploadStoryAttachmentError =
  | StoryAttachmentRepositoryError
  | typeof STORY_ATTACHMENT_UPLOAD_ERROR;

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "untitled";
  }

  const sanitized = [...trimmed]
    .map((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      if (c < 32 || c === 127 || ch === "/" || ch === "\\") {
        return "_";
      }
      return ch;
    })
    .join("");
  return sanitized.slice(0, 255);
}

export async function uploadStoryAttachment(
  repository: StoryAttachmentRepository,
  objectStore: StoryAttachmentObjectStore,
  input: {
    projectId: string;
    storyId: string;
    uploadedBy: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    fileBody: ReadableStream<Uint8Array>;
  },
): Promise<Result<StoryAttachment, UploadStoryAttachmentError>> {
  const safeFileName = sanitizeFileName(input.fileName);
  const fileKey = `${input.projectId}/${input.storyId}/${ulid()}-${safeFileName}`;

  try {
    await objectStore.put(fileKey, input.fileBody, {
      contentType: input.mimeType || "application/octet-stream",
    });
  } catch {
    return err(STORY_ATTACHMENT_UPLOAD_ERROR);
  }

  const created = await repository.create({
    projectId: input.projectId,
    storyId: input.storyId,
    fileName: safeFileName,
    fileKey,
    mimeType: input.mimeType || "application/octet-stream",
    fileSize: input.fileSize,
    uploadedBy: input.uploadedBy,
  });

  if (created.isErr()) {
    try {
      await objectStore.delete(fileKey);
    } catch {
      // ignore cleanup error
    }

    if (created.error === STORY_ATTACHMENT_NOT_FOUND_ERROR) {
      return err(STORY_ATTACHMENT_NOT_FOUND_ERROR);
    }

    return err(STORY_ATTACHMENT_REPOSITORY_ERROR);
  }

  return ok(created.value);
}
