import { and, desc, eq } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type { StoryAttachment } from "../../../domain/entities/story-attachment";
import type {
  CreateStoryAttachmentInput,
  StoryAttachmentRepository,
  StoryAttachmentRepositoryError,
} from "../../../domain/repositories/story-attachment-repository";
import {
  STORY_ATTACHMENT_NOT_FOUND_ERROR,
  STORY_ATTACHMENT_REPOSITORY_ERROR,
} from "../../../domain/repositories/story-attachment-repository";
import { createDb, type DbClient } from "../client";
import { storyAttachmentsTable } from "../schema/story-attachments";
import { storiesTable } from "../schema/stories";

type StoryAttachmentRow = typeof storyAttachmentsTable.$inferSelect;

function toStoryAttachment(row: StoryAttachmentRow): StoryAttachment {
  return {
    __typename: "StoryAttachment",
    id: row.id,
    storyId: row.storyId,
    fileName: row.fileName,
    fileKey: row.fileKey,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
  };
}

export class D1StoryAttachmentRepository implements StoryAttachmentRepository {
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async listByStory(
    projectId: string,
    storyId: string,
  ): Promise<Result<StoryAttachment[], StoryAttachmentRepositoryError>> {
    try {
      const rows = await this.db
        .select()
        .from(storyAttachmentsTable)
        .innerJoin(
          storiesTable,
          eq(storyAttachmentsTable.storyId, storiesTable.id),
        )
        .where(
          and(
            eq(storiesTable.projectId, projectId),
            eq(storyAttachmentsTable.storyId, storyId),
          ),
        )
        .orderBy(
          desc(storyAttachmentsTable.createdAt),
          desc(storyAttachmentsTable.id),
        )
        .all();

      return ok(
        rows.map((row) => {
          return toStoryAttachment(row.story_attachments);
        }),
      );
    } catch {
      return err(STORY_ATTACHMENT_REPOSITORY_ERROR);
    }
  }

  async create(
    input: CreateStoryAttachmentInput,
  ): Promise<Result<StoryAttachment, StoryAttachmentRepositoryError>> {
    try {
      const story = await this.db
        .select({ id: storiesTable.id })
        .from(storiesTable)
        .where(
          and(
            eq(storiesTable.projectId, input.projectId),
            eq(storiesTable.id, input.storyId),
          ),
        )
        .get();

      if (!story) {
        return err(STORY_ATTACHMENT_NOT_FOUND_ERROR);
      }

      const id = ulid();
      const now = new Date().toISOString();

      await this.db.insert(storyAttachmentsTable).values({
        id,
        storyId: input.storyId,
        fileName: input.fileName,
        fileKey: input.fileKey,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        uploadedBy: input.uploadedBy,
        createdAt: now,
      });

      return ok({
        __typename: "StoryAttachment",
        id,
        storyId: input.storyId,
        fileName: input.fileName,
        fileKey: input.fileKey,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        uploadedBy: input.uploadedBy,
        createdAt: now,
      });
    } catch {
      return err(STORY_ATTACHMENT_REPOSITORY_ERROR);
    }
  }

  async findById(
    projectId: string,
    storyId: string,
    attachmentId: string,
  ): Promise<Result<StoryAttachment | null, StoryAttachmentRepositoryError>> {
    try {
      const row = await this.db
        .select()
        .from(storyAttachmentsTable)
        .innerJoin(
          storiesTable,
          eq(storyAttachmentsTable.storyId, storiesTable.id),
        )
        .where(
          and(
            eq(storiesTable.projectId, projectId),
            eq(storyAttachmentsTable.storyId, storyId),
            eq(storyAttachmentsTable.id, attachmentId),
          ),
        )
        .get();

      if (!row) {
        return ok(null);
      }

      return ok(toStoryAttachment(row.story_attachments));
    } catch {
      return err(STORY_ATTACHMENT_REPOSITORY_ERROR);
    }
  }

  async delete(
    projectId: string,
    storyId: string,
    attachmentId: string,
  ): Promise<Result<void, StoryAttachmentRepositoryError>> {
    try {
      const existing = await this.findById(projectId, storyId, attachmentId);
      if (existing.isErr()) {
        return err(existing.error);
      }
      if (!existing.value) {
        return err(STORY_ATTACHMENT_NOT_FOUND_ERROR);
      }

      await this.db
        .delete(storyAttachmentsTable)
        .where(eq(storyAttachmentsTable.id, attachmentId));

      return ok(undefined);
    } catch {
      return err(STORY_ATTACHMENT_REPOSITORY_ERROR);
    }
  }
}
