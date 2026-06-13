import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import type {
  StoryActivityAction,
  StoryActivityField,
  StoryTimelineEntry,
} from "../../../domain/entities/story-timeline";
import type {
  ListStoryTimelinePageInput,
  ListStoryTimelinePageResult,
  StoryTimelineReadRepository,
  StoryTimelineReadRepositoryError,
} from "../../../domain/repositories/story-timeline-read-repository";
import { STORY_TIMELINE_READ_REPOSITORY_ERROR } from "../../../domain/repositories/story-timeline-read-repository";
import { createDb, type DbClient } from "../client";
import { storyTimelineEntriesTable } from "../schema/story-timeline";

type TimelineRow = typeof storyTimelineEntriesTable.$inferSelect;

function rowToTimelineEntry(row: TimelineRow): StoryTimelineEntry | null {
  if (row.entryType === "activity") {
    if (!row.storyId || !row.action || !row.fieldName) {
      return null;
    }
    return {
      __typename: "StoryTimelineActivityEntry",
      entryType: "activity",
      id: row.id,
      storyId: row.storyId,
      actorUserId: row.actorUserId,
      actorName: row.actorName,
      action: row.action as StoryActivityAction,
      fieldName: row.fieldName as StoryActivityField,
      oldValue: row.oldValue,
      newValue: row.newValue,
      createdAt: row.createdAt,
    };
  }

  if (row.entryType === "comment") {
    if (!row.storyId || !row.body) {
      return null;
    }
    return {
      __typename: "StoryTimelineCommentEntry",
      entryType: "comment",
      id: row.id,
      storyId: row.storyId,
      actorUserId: row.actorUserId,
      actorName: row.actorName,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  return null;
}

export class D1StoryTimelineReadRepository
  implements StoryTimelineReadRepository
{
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async listByStoryPage(
    projectId: string,
    storyId: string,
    input: ListStoryTimelinePageInput,
  ): Promise<
    Result<ListStoryTimelinePageResult, StoryTimelineReadRepositoryError>
  > {
    const take = input.limit + 1;
    const predicates: SQL[] = [
      eq(storyTimelineEntriesTable.projectId, projectId),
      eq(storyTimelineEntriesTable.storyId, storyId),
    ];

    if (input.before) {
      predicates.push(
        or(
          lt(storyTimelineEntriesTable.createdAt, input.before.createdAt),
          and(
            eq(storyTimelineEntriesTable.createdAt, input.before.createdAt),
            lt(storyTimelineEntriesTable.id, input.before.id),
          ),
        )!,
      );
    }

    try {
      const rows = await this.db
        .select()
        .from(storyTimelineEntriesTable)
        .where(and(...predicates))
        // ページングは投稿日時の降順（新しい側から `before` カーソルで遡る）
        .orderBy(
          desc(storyTimelineEntriesTable.createdAt),
          desc(storyTimelineEntriesTable.id),
        )
        .limit(take)
        .all();

      const hasMore = rows.length > input.limit;
      const windowRows = hasMore ? rows.slice(0, input.limit) : rows;

      const entriesAsc: StoryTimelineEntry[] = [];
      for (let index = windowRows.length - 1; index >= 0; index -= 1) {
        const mapped = rowToTimelineEntry(windowRows[index]!);
        if (mapped) {
          entriesAsc.push(mapped);
        }
      }

      const oldest =
        windowRows.length > 0 ? windowRows[windowRows.length - 1]! : null;
      const nextBefore =
        hasMore && oldest
          ? { createdAt: oldest.createdAt, id: oldest.id }
          : null;

      return ok({
        entries: entriesAsc,
        hasMore,
        nextBefore,
      });
    } catch {
      return err(STORY_TIMELINE_READ_REPOSITORY_ERROR);
    }
  }
}
