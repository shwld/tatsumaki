import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import type { StoryComment } from "../../../domain/entities/story-timeline";
import type {
  StoryCommentListPage,
  StoryCommentRepository,
  StoryCommentRepositoryError,
} from "../../../domain/repositories/story-comment-repository";
import {
  STORY_COMMENT_NOT_FOUND_ERROR,
  STORY_COMMENT_ARCHIVED_ERROR,
  STORY_COMMENT_REPOSITORY_ERROR,
} from "../../../domain/repositories/story-comment-repository";
import type { CreateNotificationInput } from "../../../domain/repositories/notification-repository";
import { createDb, type DbClient } from "../client";
import { storiesTable } from "../schema/stories";
import { storyTimelineEntriesTable } from "../schema/story-timeline";
import { ulid } from "ulid";

type CommentRow = typeof storyTimelineEntriesTable.$inferSelect;

function toStoryComment(row: CommentRow): StoryComment {
  return {
    __typename: "StoryComment",
    id: row.id,
    storyId: row.storyId ?? "",
    userId: row.actorUserId ?? "",
    actorName: row.actorName,
    body: row.body ?? "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class D1StoryCommentRepository implements StoryCommentRepository {
  private readonly db: DbClient;

  constructor(private readonly d1: D1Database) {
    this.db = createDb(d1);
  }

  async listByProject(
    projectId: string,
    options?: {
      limit: number;
      before?: { createdAt: string; id: string };
    },
  ): Promise<Result<StoryCommentListPage, StoryCommentRepositoryError>> {
    const limit = options?.limit ?? 30;
    const take = limit + 1;
    const predicates: SQL[] = [
      eq(storiesTable.projectId, projectId),
      eq(storyTimelineEntriesTable.entryType, "comment"),
    ];
    if (options?.before) {
      predicates.push(
        or(
          lt(storyTimelineEntriesTable.createdAt, options.before.createdAt),
          and(
            eq(storyTimelineEntriesTable.createdAt, options.before.createdAt),
            lt(storyTimelineEntriesTable.id, options.before.id),
          ),
        )!,
      );
    }

    try {
      const comments = await this.db
        .select()
        .from(storyTimelineEntriesTable)
        .innerJoin(
          storiesTable,
          eq(storyTimelineEntriesTable.storyId, storiesTable.id),
        )
        .where(and(...predicates))
        .orderBy(
          desc(storyTimelineEntriesTable.createdAt),
          desc(storyTimelineEntriesTable.id),
        )
        .limit(take)
        .all();

      const hasMore = comments.length > limit;
      const windowRows = hasMore ? comments.slice(0, limit) : comments;
      const entries = windowRows.map((row) => {
        return toStoryComment(row.story_timeline_entries);
      });
      const oldest =
        windowRows.length > 0 ? windowRows[windowRows.length - 1] : null;
      const nextBefore =
        hasMore && oldest
          ? {
              createdAt: oldest.story_timeline_entries.createdAt,
              id: oldest.story_timeline_entries.id,
            }
          : null;

      return ok({ entries, hasMore, nextBefore });
    } catch {
      return err(STORY_COMMENT_REPOSITORY_ERROR);
    }
  }

  async listByStory(
    projectId: string,
    storyId: string,
  ): Promise<Result<StoryComment[], StoryCommentRepositoryError>> {
    try {
      const comments = await this.db
        .select()
        .from(storyTimelineEntriesTable)
        .innerJoin(
          storiesTable,
          eq(storyTimelineEntriesTable.storyId, storiesTable.id),
        )
        .where(
          and(
            eq(storiesTable.projectId, projectId),
            eq(storyTimelineEntriesTable.storyId, storyId),
            eq(storyTimelineEntriesTable.entryType, "comment"),
          ),
        )
        .orderBy(
          desc(storyTimelineEntriesTable.createdAt),
          desc(storyTimelineEntriesTable.id),
        )
        .all();

      return ok(
        comments.map((row) => {
          return toStoryComment(row.story_timeline_entries);
        }),
      );
    } catch {
      return err(STORY_COMMENT_REPOSITORY_ERROR);
    }
  }

  async create(
    projectId: string,
    storyId: string,
    input: {
      userId: string;
      actorName: string;
      body: string;
      notifications?: (comment: StoryComment) => CreateNotificationInput[];
    },
  ): Promise<Result<StoryComment, StoryCommentRepositoryError>> {
    try {
      const story = await this.db
        .select()
        .from(storiesTable)
        .where(
          and(
            eq(storiesTable.id, storyId),
            eq(storiesTable.projectId, projectId),
          ),
        )
        .get();

      if (!story) {
        return err(STORY_COMMENT_NOT_FOUND_ERROR);
      }
      if (story.archivedAt !== null) return err(STORY_COMMENT_ARCHIVED_ERROR);

      const id = ulid();
      const now = new Date().toISOString();

      const comment: StoryComment = {
        __typename: "StoryComment",
        id,
        storyId,
        userId: input.userId,
        actorName: input.actorName,
        body: input.body,
        createdAt: now,
        updatedAt: now,
      };

      const insertComment = this.d1
        .prepare(
          "INSERT INTO story_timeline_entries (id, project_id, story_id, entry_type, actor_user_id, actor_name, body, created_at, updated_at) SELECT ?, ?, id, 'comment', ?, ?, ?, ?, ? FROM stories WHERE id = ? AND project_id = ? AND archived_at IS NULL",
        )
        .bind(
          id,
          projectId,
          input.userId,
          input.actorName,
          input.body,
          now,
          now,
          storyId,
          projectId,
        );
      const insertNotifications = (input.notifications?.(comment) ?? []).map(
        (n) =>
          this.d1
            .prepare(
              "INSERT OR IGNORE INTO notifications (id, project_id, recipient_user_id, actor_user_id, actor_name, story_id, story_title_snapshot, invitation_id, kind, message, source_type, source_id, dedupe_key, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM story_timeline_entries WHERE id = ?)",
            )
            .bind(
              n.id,
              n.projectId,
              n.recipientUserId,
              n.actorUserId,
              n.actorName,
              n.storyId,
              n.storyTitleSnapshot,
              n.invitationId,
              n.kind,
              n.message,
              n.sourceType,
              n.sourceId,
              n.dedupeKey,
              n.createdAt,
              n.updatedAt,
              id,
            ),
      );
      const [inserted] = await this.d1.batch([
        insertComment,
        ...insertNotifications,
      ]);
      if (inserted?.meta.changes !== 1)
        return err(STORY_COMMENT_ARCHIVED_ERROR);

      return ok(comment);
    } catch {
      return err(STORY_COMMENT_REPOSITORY_ERROR);
    }
  }

  async findById(
    projectId: string,
    commentId: string,
  ): Promise<Result<StoryComment | null, StoryCommentRepositoryError>> {
    try {
      const row = await this.db
        .select()
        .from(storyTimelineEntriesTable)
        .innerJoin(
          storiesTable,
          eq(storyTimelineEntriesTable.storyId, storiesTable.id),
        )
        .where(
          and(
            eq(storyTimelineEntriesTable.id, commentId),
            eq(storiesTable.projectId, projectId),
            eq(storyTimelineEntriesTable.entryType, "comment"),
          ),
        )
        .get();

      if (!row) {
        return ok(null);
      }

      return ok(toStoryComment(row.story_timeline_entries));
    } catch {
      return err(STORY_COMMENT_REPOSITORY_ERROR);
    }
  }

  private async reasonNoRowChanged(
    projectId: string,
    commentId: string,
  ): Promise<
    | typeof STORY_COMMENT_ARCHIVED_ERROR
    | typeof STORY_COMMENT_NOT_FOUND_ERROR
    | typeof STORY_COMMENT_REPOSITORY_ERROR
  > {
    const latest = await this.findById(projectId, commentId);
    if (latest.isErr()) return STORY_COMMENT_REPOSITORY_ERROR;
    return latest.value
      ? STORY_COMMENT_ARCHIVED_ERROR
      : STORY_COMMENT_NOT_FOUND_ERROR;
  }

  async update(
    projectId: string,
    commentId: string,
    input: { body: string },
  ): Promise<Result<StoryComment, StoryCommentRepositoryError>> {
    try {
      const existing = await this.findById(projectId, commentId);
      if (existing.isErr()) {
        return err(existing.error);
      }
      if (!existing.value) {
        return err(STORY_COMMENT_NOT_FOUND_ERROR);
      }

      const now = new Date().toISOString();
      const changed = await this.db
        .update(storyTimelineEntriesTable)
        .set({ body: input.body, updatedAt: now })
        .where(
          and(
            eq(storyTimelineEntriesTable.id, commentId),
            eq(storyTimelineEntriesTable.entryType, "comment"),
            sql`exists (select 1 from stories where id = ${storyTimelineEntriesTable.storyId} and archived_at is null)`,
          ),
        )
        .returning({ id: storyTimelineEntriesTable.id });
      if (changed.length === 0) {
        return err(await this.reasonNoRowChanged(projectId, commentId));
      }

      return ok({
        ...existing.value,
        body: input.body,
        updatedAt: now,
      });
    } catch {
      return err(STORY_COMMENT_REPOSITORY_ERROR);
    }
  }

  async delete(
    projectId: string,
    commentId: string,
  ): Promise<Result<void, StoryCommentRepositoryError>> {
    try {
      const existing = await this.findById(projectId, commentId);
      if (existing.isErr()) {
        return err(existing.error);
      }
      if (!existing.value) {
        return err(STORY_COMMENT_NOT_FOUND_ERROR);
      }

      const changed = await this.db
        .delete(storyTimelineEntriesTable)
        .where(
          and(
            eq(storyTimelineEntriesTable.id, commentId),
            eq(storyTimelineEntriesTable.entryType, "comment"),
            sql`exists (select 1 from stories where id = ${storyTimelineEntriesTable.storyId} and archived_at is null)`,
          ),
        )
        .returning({ id: storyTimelineEntriesTable.id });
      if (changed.length === 0) {
        return err(await this.reasonNoRowChanged(projectId, commentId));
      }

      return ok(undefined);
    } catch {
      return err(STORY_COMMENT_REPOSITORY_ERROR);
    }
  }

  async deleteAllForStory(
    projectId: string,
    storyId: string,
  ): Promise<Result<void, StoryCommentRepositoryError>> {
    try {
      await this.db
        .delete(storyTimelineEntriesTable)
        .where(
          and(
            eq(storyTimelineEntriesTable.projectId, projectId),
            eq(storyTimelineEntriesTable.storyId, storyId),
            eq(storyTimelineEntriesTable.entryType, "comment"),
          ),
        );

      return ok(undefined);
    } catch {
      return err(STORY_COMMENT_REPOSITORY_ERROR);
    }
  }
}
