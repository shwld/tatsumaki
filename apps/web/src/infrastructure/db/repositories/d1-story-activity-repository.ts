import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type {
  ProjectHistoryEntry,
  StoryActivity,
  StoryActivityAction,
} from "../../../domain/entities/story-timeline";
import type {
  RecordStoryActivityInput,
  ProjectHistoryPage,
  StoryActivityRepository,
  StoryActivityRepositoryError,
} from "../../../domain/repositories/story-activity-repository";
import { STORY_ACTIVITY_REPOSITORY_ERROR } from "../../../domain/repositories/story-activity-repository";
import { createDb, type DbClient } from "../client";
import { storiesTable } from "../schema/stories";
import { storyTimelineEntriesTable } from "../schema/story-timeline";

type ActivityRow = typeof storyTimelineEntriesTable.$inferSelect;

function toStoryActivity(row: ActivityRow): StoryActivity {
  return {
    __typename: "StoryActivity",
    id: row.id,
    storyId: row.storyId ?? "",
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    action: row.action as StoryActivityAction,
    fieldName: row.fieldName as StoryActivity["fieldName"],
    oldValue: row.oldValue,
    newValue: row.newValue,
    createdAt: row.createdAt,
  };
}

function toProjectHistoryEntry(
  row: ActivityRow,
  storyTitle: string | null,
): ProjectHistoryEntry {
  return {
    __typename: "ProjectHistoryEntry",
    id: row.id,
    storyId: row.storyId ?? null,
    storyTitle,
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    action: row.action as StoryActivityAction,
    fieldName: row.fieldName as ProjectHistoryEntry["fieldName"],
    oldValue: row.oldValue,
    newValue: row.newValue,
    createdAt: row.createdAt,
  };
}

export class D1StoryActivityRepository implements StoryActivityRepository {
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async recordMany(
    activities: RecordStoryActivityInput[],
  ): Promise<Result<void, StoryActivityRepositoryError>> {
    if (activities.length === 0) {
      return ok(undefined);
    }

    try {
      await this.db.insert(storyTimelineEntriesTable).values(
        activities.map((activity) => {
          return {
            id: activity.id ?? ulid(),
            projectId: activity.projectId,
            storyId: activity.storyId,
            entryType: "activity",
            actorUserId: activity.actorUserId,
            actorName: activity.actorName,
            action: activity.action,
            fieldName: activity.fieldName,
            oldValue: activity.oldValue,
            newValue: activity.newValue,
          };
        }),
      );

      return ok(undefined);
    } catch {
      return err(STORY_ACTIVITY_REPOSITORY_ERROR);
    }
  }

  async listByStory(
    projectId: string,
    storyId: string,
  ): Promise<Result<StoryActivity[], StoryActivityRepositoryError>> {
    try {
      const activities = await this.db
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
            eq(storyTimelineEntriesTable.entryType, "activity"),
          ),
        )
        .orderBy(
          desc(storyTimelineEntriesTable.createdAt),
          desc(storyTimelineEntriesTable.id),
        )
        .all();

      return ok(
        activities.map((row) => {
          return toStoryActivity(row.story_timeline_entries);
        }),
      );
    } catch {
      return err(STORY_ACTIVITY_REPOSITORY_ERROR);
    }
  }

  async listByProject(
    projectId: string,
    options?: {
      limit: number;
      before?: { createdAt: string; id: string };
    },
  ): Promise<Result<ProjectHistoryPage, StoryActivityRepositoryError>> {
    const limit = options?.limit ?? 30;
    const take = limit + 1;
    const predicates: SQL[] = [
      eq(storyTimelineEntriesTable.projectId, projectId),
      eq(storyTimelineEntriesTable.entryType, "activity"),
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
      const activities = await this.db
        .select({
          entry: storyTimelineEntriesTable,
          storyTitle: storiesTable.title,
        })
        .from(storyTimelineEntriesTable)
        .leftJoin(
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

      const hasMore = activities.length > limit;
      const windowRows = hasMore ? activities.slice(0, limit) : activities;
      const entries = windowRows.map((row) =>
        toProjectHistoryEntry(row.entry, row.storyTitle ?? null),
      );
      const oldest =
        windowRows.length > 0 ? windowRows[windowRows.length - 1] : null;
      const nextBefore =
        hasMore && oldest
          ? {
              createdAt: oldest.entry.createdAt,
              id: oldest.entry.id,
            }
          : null;

      return ok({ entries, hasMore, nextBefore });
    } catch {
      return err(STORY_ACTIVITY_REPOSITORY_ERROR);
    }
  }
}
