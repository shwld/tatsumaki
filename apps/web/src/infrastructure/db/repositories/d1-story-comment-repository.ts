import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import type { StoryComment } from "../../../domain/entities/story-timeline";
import type {
  StoryCommentListPage,
  StoryCommentRepository,
  StoryCommentRepositoryError,
} from "../../../domain/repositories/story-comment-repository";
import {
  STORY_COMMENT_NOT_FOUND_ERROR,
  STORY_COMMENT_REPOSITORY_ERROR,
} from "../../../domain/repositories/story-comment-repository";
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

  constructor(d1: D1Database) {
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
    input: { userId: string; actorName: string; body: string },
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

      const id = ulid();
      const now = new Date().toISOString();

      await this.db.insert(storyTimelineEntriesTable).values({
        id,
        projectId,
        storyId,
        entryType: "comment",
        actorUserId: input.userId,
        actorName: input.actorName,
        action: null,
        fieldName: null,
        oldValue: null,
        newValue: null,
        body: input.body,
        createdAt: now,
        updatedAt: now,
      });

      return ok({
        __typename: "StoryComment",
        id,
        storyId,
        userId: input.userId,
        actorName: input.actorName,
        body: input.body,
        createdAt: now,
        updatedAt: now,
      });
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
      await this.db
        .update(storyTimelineEntriesTable)
        .set({ body: input.body, updatedAt: now })
        .where(
          and(
            eq(storyTimelineEntriesTable.id, commentId),
            eq(storyTimelineEntriesTable.entryType, "comment"),
          ),
        );

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

      await this.db
        .delete(storyTimelineEntriesTable)
        .where(
          and(
            eq(storyTimelineEntriesTable.id, commentId),
            eq(storyTimelineEntriesTable.entryType, "comment"),
          ),
        );

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
