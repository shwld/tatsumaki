import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type {
  Story,
  StoryPoint,
  StoryPriorityHistory,
  StoryStatus,
  StoryType,
} from "../../../domain/entities/story";
import { STORY_STATUSES } from "../../../domain/entities/story";
import type {
  AcceptedStoryIterationAnchor,
  CreateStoryInput,
  ListStoriesInput,
  ListStoriesSummary,
  ReassignStoriesAcrossIterationsInput,
  ReorderStoriesInput,
  StoryRepository,
  StoryRepositoryError,
  UpdateStoryInput,
} from "../../../domain/repositories/story-repository";
import {
  STORY_OWNER_NOT_PROJECT_MEMBER_ERROR,
  STORY_REPOSITORY_ERROR,
  STORY_REQUESTER_NOT_PROJECT_MEMBER_ERROR,
} from "../../../domain/repositories/story-repository";
import { todayIso } from "../../../shared/date/today-iso";
import { createDb, type DbClient } from "../client";
import { iterationsTable } from "../schema/iterations";
import { projectMembersTable } from "../schema/project-members";
import { storyBlockersTable } from "../schema/story-blockers";
import {
  storyOwnersTable,
  storyPriorityHistoryTable,
  storiesTable,
} from "../schema/stories";

type StoryRow = typeof storiesTable.$inferSelect;
type StoryPriorityHistoryRow = typeof storyPriorityHistoryTable.$inferSelect;
type StoryBlockerRow = typeof storyBlockersTable.$inferSelect;

function parseLabels(labelsJson: string): string[] {
  try {
    const parsed = JSON.parse(labelsJson);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => {
      return typeof value === "string";
    });
  } catch {
    return [];
  }
}

function toStory(
  row: StoryRow,
  ownerIdsByStoryId: ReadonlyMap<string, string[]>,
): Story {
  const rawStoryPoint = row.storyPoint;
  const storyPoint =
    typeof rawStoryPoint === "number" && Number.isInteger(rawStoryPoint)
      ? (rawStoryPoint as StoryPoint)
      : null;

  const status = STORY_STATUSES.includes(row.status as StoryStatus)
    ? (row.status as StoryStatus)
    : "Unstarted";

  return {
    __typename: "Story",
    id: row.id,
    storyNumber: row.storyNumber,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    type: row.type as StoryType,
    status,
    statusChangedAt: row.statusChangedAt,
    completedAt: row.completedAt ?? null,
    storyPoint,
    labels: parseLabels(row.labels),
    epicId: row.epicId,
    iterationId: row.iterationId ?? null,
    isIcebox: row.isIcebox === 1,
    ownerIds: ownerIdsByStoryId.get(row.id) ?? [],
    requesterId: row.requesterId,
    releaseDate: row.releaseDate ?? null,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isBlocked: false,
    isBlocking: false,
    blockingStories: [],
    blockedStories: [],
  };
}

function toStorySummary(row: StoryRow): Story {
  const rawStoryPoint = row.storyPoint;
  const storyPoint =
    typeof rawStoryPoint === "number" && Number.isInteger(rawStoryPoint)
      ? (rawStoryPoint as StoryPoint)
      : null;

  const status = STORY_STATUSES.includes(row.status as StoryStatus)
    ? (row.status as StoryStatus)
    : "Unstarted";

  return {
    __typename: "Story",
    id: row.id,
    storyNumber: row.storyNumber,
    projectId: row.projectId,
    title: row.title,
    description: "",
    type: row.type as StoryType,
    status,
    statusChangedAt: row.statusChangedAt,
    completedAt: row.completedAt ?? null,
    storyPoint,
    labels: [],
    epicId: row.epicId,
    iterationId: row.iterationId ?? null,
    isIcebox: row.isIcebox === 1,
    ownerIds: [],
    requesterId: row.requesterId,
    releaseDate: row.releaseDate ?? null,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isBlocked: false,
    isBlocking: false,
    blockingStories: [],
    blockedStories: [],
  };
}

function buildListFilters(input: ListStoriesInput): SQL[] {
  const filters: SQL[] = [eq(storiesTable.projectId, input.projectId)];
  const normalizedQuery = input.query?.trim().toLowerCase();

  if (input.status !== undefined) {
    filters.push(eq(storiesTable.status, input.status));
  }

  if (Array.isArray(input.statuses) && input.statuses.length > 0) {
    filters.push(inArray(storiesTable.status, input.statuses));
  }

  if (Array.isArray(input.types) && input.types.length > 0) {
    filters.push(inArray(storiesTable.type, input.types));
  }

  if (input.epicId !== undefined) {
    filters.push(eq(storiesTable.epicId, input.epicId));
  }

  if (Array.isArray(input.epicIds) && input.epicIds.length > 0) {
    filters.push(inArray(storiesTable.epicId, input.epicIds));
  }

  if (input.requesterId !== undefined) {
    filters.push(eq(storiesTable.requesterId, input.requesterId));
  }

  if (input.isIcebox !== undefined) {
    filters.push(eq(storiesTable.isIcebox, input.isIcebox ? 1 : 0));
  }

  if (input.iterationId !== undefined) {
    filters.push(eq(storiesTable.iterationId, input.iterationId));
  }

  if (input.excludeIterationId !== undefined) {
    filters.push(
      sql`(${storiesTable.iterationId} is null or ${storiesTable.iterationId} <> ${input.excludeIterationId})`,
    );
  }

  if (input.iterationDateScope !== undefined) {
    const today = todayIso();
    const scopeCondition =
      input.iterationDateScope === "past"
        ? sql`${iterationsTable.endDate} <= ${today}`
        : input.iterationDateScope === "current"
          ? sql`${iterationsTable.startDate} <= ${today} and ${iterationsTable.endDate} > ${today}`
          : sql`${iterationsTable.startDate} > ${today}`;
    const inScopeIteration = sql`exists (
      select 1
      from ${iterationsTable}
      where ${iterationsTable.id} = ${storiesTable.iterationId}
        and ${iterationsTable.projectId} = ${input.projectId}
        and ${scopeCondition}
    )`;
    if (input.includeUnassignedIteration === true) {
      filters.push(
        sql`(${storiesTable.iterationId} is null or ${inScopeIteration})`,
      );
    } else {
      filters.push(
        sql`(${storiesTable.iterationId} is not null and ${inScopeIteration})`,
      );
    }
  }

  if (input.ownerId !== undefined) {
    filters.push(
      sql`exists (
        select 1
        from ${storyOwnersTable}
        where ${storyOwnersTable.storyId} = ${storiesTable.id}
          and ${storyOwnersTable.userId} = ${input.ownerId}
      )`,
    );
  }

  if (Array.isArray(input.ownerIds) && input.ownerIds.length > 0) {
    filters.push(
      sql`exists (
        select 1
        from ${storyOwnersTable}
        where ${storyOwnersTable.storyId} = ${storiesTable.id}
          and ${storyOwnersTable.userId} in (${sql.join(
            input.ownerIds.map((id) => sql`${id}`),
            sql`, `,
          )})
      )`,
    );
  }

  if (input.label !== undefined) {
    filters.push(
      sql`exists (
        select 1
        from json_each(${storiesTable.labels})
        where json_each.value = ${input.label}
      )`,
    );
  }

  if (Array.isArray(input.labels) && input.labels.length > 0) {
    filters.push(
      sql`exists (
        select 1
        from json_each(${storiesTable.labels})
        where json_each.value in (${sql.join(
          input.labels.map((l) => sql`${l}`),
          sql`, `,
        )})
      )`,
    );
  }

  if (normalizedQuery) {
    const escaped = normalizedQuery.replace(/[\\%_]/g, "\\$&");
    const like = `%${escaped}%`;
    filters.push(
      sql`(
        lower(${storiesTable.title}) like ${like} escape '\\'
        or lower(${storiesTable.description}) like ${like} escape '\\'
        or exists (
          select 1
          from json_each(${storiesTable.labels})
          where lower(cast(json_each.value as text)) like ${like} escape '\\'
        )
      )`,
    );
  }

  return filters;
}

function toStoryPriorityHistory(
  row: StoryPriorityHistoryRow,
): StoryPriorityHistory {
  return {
    __typename: "StoryPriorityHistory",
    id: row.id,
    storyId: row.storyId,
    fromPosition: row.fromPosition,
    toPosition: row.toPosition,
    changedAt: row.changedAt,
  };
}

const CURRENT_PANEL_STATUSES: ReadonlySet<StoryStatus> = new Set([
  "Started",
  "Finished",
  "Delivered",
]);
const BACKLOG_PANEL_STATUSES: ReadonlySet<StoryStatus> = new Set([
  "Unstarted",
  "Rejected",
]);

function isBacklogStoryInput(input: CreateStoryInput): boolean {
  if (input.isIcebox) {
    return false;
  }

  if (input.status === "Accepted") {
    return false;
  }

  return !CURRENT_PANEL_STATUSES.has(input.status);
}

function isIceboxStoryInput(input: CreateStoryInput): boolean {
  return input.isIcebox;
}

export class D1StoryRepository implements StoryRepository {
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  private attachStoryRelations(
    stories: Story[],
    blockerRows: StoryBlockerRow[],
    titleByStoryId: Map<string, string>,
  ): Story[] {
    const storyById = new Map(
      stories.map((story) => {
        return [story.id, story];
      }),
    );

    for (const row of blockerRows) {
      const blocking = storyById.get(row.blockingStoryId);
      const blocked = storyById.get(row.blockedStoryId);
      if (!blocking && !blocked) {
        continue;
      }

      const blockingTitle = titleByStoryId.get(row.blockingStoryId);
      const blockedTitle = titleByStoryId.get(row.blockedStoryId);
      if (!blockingTitle || !blockedTitle) {
        continue;
      }

      if (blocked) {
        blocked.blockingStories = [
          ...(blocked.blockingStories ?? []),
          { id: row.blockingStoryId, title: blockingTitle },
        ];
      }

      if (blocking) {
        blocking.blockedStories = [
          ...(blocking.blockedStories ?? []),
          { id: row.blockedStoryId, title: blockedTitle },
        ];
      }
    }

    for (const story of stories) {
      story.blockingStories = (story.blockingStories ?? []).sort((a, b) => {
        return a.title.localeCompare(b.title);
      });
      story.blockedStories = (story.blockedStories ?? []).sort((a, b) => {
        return a.title.localeCompare(b.title);
      });
      story.isBlocked = (story.blockingStories?.length ?? 0) > 0;
      story.isBlocking = (story.blockedStories?.length ?? 0) > 0;
    }

    return stories;
  }

  private async listOwnerIdsByStoryIds(
    storyIds: string[],
  ): Promise<Map<string, string[]>> {
    const ownerIdsByStoryId = new Map<string, string[]>();

    if (storyIds.length === 0) {
      return ownerIdsByStoryId;
    }

    // D1 has a limit of 100 bind parameters per query
    const chunks = chunkArray(storyIds, D1_MAX_BIND_PARAMS);
    const allRows = [];
    for (const chunk of chunks) {
      const rows = await this.db
        .select({
          storyId: storyOwnersTable.storyId,
          userId: storyOwnersTable.userId,
        })
        .from(storyOwnersTable)
        .where(inArray(storyOwnersTable.storyId, chunk))
        .orderBy(asc(storyOwnersTable.storyId), asc(storyOwnersTable.userId))
        .all();
      allRows.push(...rows);
    }

    for (const row of allRows) {
      const current = ownerIdsByStoryId.get(row.storyId) ?? [];
      current.push(row.userId);
      ownerIdsByStoryId.set(row.storyId, current);
    }

    return ownerIdsByStoryId;
  }

  private async listWithRelations(rows: StoryRow[]): Promise<Story[]> {
    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((story) => {
      return story.id;
    });
    const ownerIdsByStoryId = await this.listOwnerIdsByStoryIds(ids);
    const stories = rows.map((row) => {
      return toStory(row, ownerIdsByStoryId);
    });

    const titleByStoryId = new Map(
      stories.map((story) => {
        return [story.id, story.title];
      }),
    );
    // D1 has a limit of 100 bind parameters per query.
    // This query uses 2 IN clauses, so chunk at half the limit.
    const blockerChunks = chunkArray(ids, D1_MAX_BIND_PARAMS_HALF);
    const blockerRows = [];
    for (const chunk of blockerChunks) {
      const rows = await this.db
        .select()
        .from(storyBlockersTable)
        .where(
          or(
            inArray(storyBlockersTable.blockingStoryId, chunk),
            inArray(storyBlockersTable.blockedStoryId, chunk),
          ),
        )
        .all();
      blockerRows.push(...rows);
    }

    return this.attachStoryRelations(stories, blockerRows, titleByStoryId);
  }

  private async enrichSummaryBlockFlags(stories: Story[]): Promise<Story[]> {
    if (stories.length === 0) {
      return stories;
    }
    const ids = stories.map((story) => story.id);
    const blockedStoryIds = new Set<string>();
    const blockingStoryIds = new Set<string>();
    const chunks = chunkArray(ids, D1_MAX_BIND_PARAMS);
    for (const chunk of chunks) {
      const [blockedRows, blockingRows] = await Promise.all([
        this.db
          .select({ id: storyBlockersTable.blockedStoryId })
          .from(storyBlockersTable)
          .where(inArray(storyBlockersTable.blockedStoryId, chunk))
          .all(),
        this.db
          .select({ id: storyBlockersTable.blockingStoryId })
          .from(storyBlockersTable)
          .where(inArray(storyBlockersTable.blockingStoryId, chunk))
          .all(),
      ]);
      for (const row of blockedRows) {
        blockedStoryIds.add(row.id);
      }
      for (const row of blockingRows) {
        blockingStoryIds.add(row.id);
      }
    }

    for (const story of stories) {
      story.isBlocked = blockedStoryIds.has(story.id);
      story.isBlocking = blockingStoryIds.has(story.id);
    }
    return stories;
  }

  private async findStoryTitlesByIds(
    projectId: string,
    ids: string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }

    const uniqueIds = Array.from(new Set(ids));
    // D1 has a limit of 100 bind parameters per query (projectId uses 1)
    const chunks = chunkArray(uniqueIds, D1_MAX_BIND_PARAMS - 1);
    const allRows = [];
    for (const chunk of chunks) {
      const rows = await this.db
        .select({ id: storiesTable.id, title: storiesTable.title })
        .from(storiesTable)
        .where(
          and(
            eq(storiesTable.projectId, projectId),
            inArray(storiesTable.id, chunk),
          ),
        )
        .all();
      allRows.push(...rows);
    }

    return new Map(
      allRows.map((row) => {
        return [row.id, row.title];
      }),
    );
  }

  private async findByIdWithRelations(
    projectId: string,
    id: string,
  ): Promise<Story | null> {
    const row = await this.db
      .select()
      .from(storiesTable)
      .where(
        and(eq(storiesTable.projectId, projectId), eq(storiesTable.id, id)),
      )
      .get();

    if (!row) {
      return null;
    }

    const ownerIdsByStoryId = await this.listOwnerIdsByStoryIds([row.id]);
    const story = toStory(row, ownerIdsByStoryId);
    const blockerRows = await this.db
      .select()
      .from(storyBlockersTable)
      .where(
        or(
          eq(storyBlockersTable.blockingStoryId, id),
          eq(storyBlockersTable.blockedStoryId, id),
        ),
      )
      .all();

    const relatedIds = blockerRows.flatMap((blocker) => {
      return [blocker.blockingStoryId, blocker.blockedStoryId];
    });
    const titleByStoryId = await this.findStoryTitlesByIds(projectId, [
      id,
      ...relatedIds,
    ]);

    return this.attachStoryRelations([story], blockerRows, titleByStoryId)[0];
  }

  private async assertOwnerIdsAreProjectMembers(
    projectId: string,
    ownerIds: string[],
  ): Promise<Result<void, StoryRepositoryError>> {
    if (ownerIds.length === 0) {
      return ok(undefined);
    }

    const members = await this.db
      .select({ userId: projectMembersTable.userId })
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, projectId),
          inArray(projectMembersTable.userId, ownerIds),
        ),
      )
      .all();

    const memberIds = new Set(
      members.map((member) => {
        return member.userId;
      }),
    );

    const hasUnknownOwner = ownerIds.some((ownerId) => {
      return !memberIds.has(ownerId);
    });

    if (hasUnknownOwner) {
      return err(STORY_OWNER_NOT_PROJECT_MEMBER_ERROR);
    }

    return ok(undefined);
  }

  private async assertRequesterIsProjectMember(
    projectId: string,
    requesterId: string | null,
  ): Promise<Result<void, StoryRepositoryError>> {
    if (!requesterId) {
      return ok(undefined);
    }

    const requester = await this.db
      .select({ userId: projectMembersTable.userId })
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, projectId),
          eq(projectMembersTable.userId, requesterId),
        ),
      )
      .get();

    if (!requester) {
      return err(STORY_REQUESTER_NOT_PROJECT_MEMBER_ERROR);
    }

    return ok(undefined);
  }

  async create(
    input: CreateStoryInput,
  ): Promise<Result<Story, StoryRepositoryError>> {
    const ownerValidation = await this.assertOwnerIdsAreProjectMembers(
      input.projectId,
      input.ownerIds,
    );
    if (ownerValidation.isErr()) {
      return err(ownerValidation.error);
    }

    const requesterValidation = await this.assertRequesterIsProjectMember(
      input.projectId,
      input.requesterId,
    );
    if (requesterValidation.isErr()) {
      return err(requesterValidation.error);
    }

    let nextPosition: number;
    const maxStoryNumberRow = await this.db
      .select({
        maxStoryNumber: sql<number>`coalesce(max(${storiesTable.storyNumber}), 0)`,
      })
      .from(storiesTable)
      .where(eq(storiesTable.projectId, input.projectId))
      .get();
    const nextStoryNumber = (maxStoryNumberRow?.maxStoryNumber ?? 0) + 1;
    if (isBacklogStoryInput(input)) {
      await this.db
        .update(storiesTable)
        .set({
          position: sql`${storiesTable.position} + 1`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(storiesTable.projectId, input.projectId));

      nextPosition = 1;
    } else if (isIceboxStoryInput(input)) {
      await this.db
        .update(storiesTable)
        .set({
          position: sql`${storiesTable.position} + 1`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(
            eq(storiesTable.projectId, input.projectId),
            eq(storiesTable.isIcebox, 1),
          ),
        );

      nextPosition = 1;
    } else {
      const maxPositionRow = await this.db
        .select({
          maxPosition: sql<number>`coalesce(max(${storiesTable.position}), 0)`,
        })
        .from(storiesTable)
        .where(eq(storiesTable.projectId, input.projectId))
        .get();

      nextPosition = (maxPositionRow?.maxPosition ?? 0) + 1;
    }

    const [inserted] = await this.db
      .insert(storiesTable)
      .values({
        id: ulid(),
        storyNumber: nextStoryNumber,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        type: input.type,
        status: input.status,
        storyPoint: input.storyPoint,
        labels: JSON.stringify(input.labels),
        requesterId: input.requesterId,
        releaseDate: input.releaseDate ?? null,
        isIcebox: input.isIcebox ? 1 : 0,
        position: nextPosition,
        completedAt:
          input.status === "Accepted" ? sql`CURRENT_TIMESTAMP` : null,
      })
      .returning({ id: storiesTable.id });

    if (!inserted) {
      return err(STORY_REPOSITORY_ERROR);
    }

    if (input.ownerIds.length > 0) {
      await this.db.insert(storyOwnersTable).values(
        input.ownerIds.map((ownerId) => {
          return {
            storyId: inserted.id,
            userId: ownerId,
          };
        }),
      );
    }

    const created = await this.findByIdWithRelations(
      input.projectId,
      inserted.id,
    );

    if (!created) {
      return err(STORY_REPOSITORY_ERROR);
    }

    return ok(created);
  }

  async findById(
    projectId: string,
    id: string,
  ): Promise<Result<Story | null, StoryRepositoryError>> {
    const story = await this.findByIdWithRelations(projectId, id);
    if (!story) {
      return ok(null);
    }

    return ok(story);
  }

  async findByStoryNumber(
    projectId: string,
    storyNumber: number,
  ): Promise<Result<Story | null, StoryRepositoryError>> {
    const story = await this.db
      .select()
      .from(storiesTable)
      .where(
        and(
          eq(storiesTable.projectId, projectId),
          eq(storiesTable.storyNumber, storyNumber),
        ),
      )
      .get();
    if (!story) {
      return ok(null);
    }
    const withRelations = await this.findByIdWithRelations(projectId, story.id);
    return ok(withRelations ?? null);
  }

  async update(
    input: UpdateStoryInput,
  ): Promise<Result<Story | null, StoryRepositoryError>> {
    const current = await this.db
      .select()
      .from(storiesTable)
      .where(
        and(
          eq(storiesTable.projectId, input.projectId),
          eq(storiesTable.id, input.id),
        ),
      )
      .get();

    if (!current) {
      return ok(null);
    }

    if (input.ownerIds !== undefined) {
      const ownerValidation = await this.assertOwnerIdsAreProjectMembers(
        input.projectId,
        input.ownerIds,
      );
      if (ownerValidation.isErr()) {
        return err(ownerValidation.error);
      }
    }

    if (input.requesterId !== undefined) {
      const requesterValidation = await this.assertRequesterIsProjectMember(
        input.projectId,
        input.requesterId,
      );
      if (requesterValidation.isErr()) {
        return err(requesterValidation.error);
      }
    }

    const shouldUpdateStatusTimestamp =
      input.status !== undefined && input.status !== current.status;
    const nextStatus = (input.status ?? current.status) as StoryStatus;
    const nextIsIcebox =
      input.isIcebox !== undefined ? input.isIcebox : current.isIcebox === 1;

    const prevStatus = current.status as StoryStatus;
    const setCompletedAtNow =
      input.status !== undefined &&
      nextStatus === "Accepted" &&
      prevStatus !== "Accepted";
    const clearCompletedAt =
      input.status !== undefined &&
      nextStatus !== "Accepted" &&
      prevStatus === "Accepted";

    let autoAssignedIterationId: string | null = null;
    if (
      current.iterationId === null &&
      !nextIsIcebox &&
      CURRENT_PANEL_STATUSES.has(nextStatus)
    ) {
      const today = todayIso();
      const currentIteration = await this.db
        .select({ id: iterationsTable.id })
        .from(iterationsTable)
        .where(
          and(
            eq(iterationsTable.projectId, input.projectId),
            sql`${iterationsTable.startDate} <= ${today}`,
            sql`${iterationsTable.endDate} > ${today}`,
          ),
        )
        .orderBy(desc(iterationsTable.startDate))
        .limit(1)
        .get();
      autoAssignedIterationId = currentIteration?.id ?? null;
    }
    let shouldClearIterationId = false;
    if (
      input.status !== undefined &&
      BACKLOG_PANEL_STATUSES.has(nextStatus) &&
      current.iterationId !== null
    ) {
      const today = todayIso();
      const assignedCurrentIteration = await this.db
        .select({ id: iterationsTable.id })
        .from(iterationsTable)
        .where(
          and(
            eq(iterationsTable.projectId, input.projectId),
            eq(iterationsTable.id, current.iterationId),
            sql`${iterationsTable.startDate} <= ${today}`,
            sql`${iterationsTable.endDate} > ${today}`,
          ),
        )
        .limit(1)
        .get();
      shouldClearIterationId = !assignedCurrentIteration;
    }

    await this.db
      .update(storiesTable)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.storyPoint !== undefined
          ? { storyPoint: input.storyPoint }
          : {}),
        ...(input.labels !== undefined
          ? { labels: JSON.stringify(input.labels) }
          : {}),
        ...(input.requesterId !== undefined
          ? { requesterId: input.requesterId }
          : {}),
        ...(input.releaseDate !== undefined
          ? { releaseDate: input.releaseDate }
          : {}),
        ...(input.isIcebox !== undefined
          ? { isIcebox: input.isIcebox ? 1 : 0 }
          : {}),
        ...(autoAssignedIterationId !== null
          ? { iterationId: autoAssignedIterationId }
          : {}),
        ...(shouldClearIterationId ? { iterationId: null } : {}),
        ...(shouldUpdateStatusTimestamp
          ? { statusChangedAt: sql`CURRENT_TIMESTAMP` }
          : {}),
        ...(setCompletedAtNow ? { completedAt: sql`CURRENT_TIMESTAMP` } : {}),
        ...(clearCompletedAt ? { completedAt: null } : {}),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(
        and(
          eq(storiesTable.projectId, input.projectId),
          eq(storiesTable.id, input.id),
        ),
      );

    if (input.ownerIds !== undefined) {
      await this.db
        .delete(storyOwnersTable)
        .where(eq(storyOwnersTable.storyId, input.id));

      if (input.ownerIds.length > 0) {
        await this.db.insert(storyOwnersTable).values(
          input.ownerIds.map((ownerId) => {
            return {
              storyId: input.id,
              userId: ownerId,
            };
          }),
        );
      }
    }

    const updated = await this.findByIdWithRelations(input.projectId, input.id);

    if (!updated) {
      return err(STORY_REPOSITORY_ERROR);
    }

    return ok(updated);
  }

  async delete(
    projectId: string,
    id: string,
  ): Promise<Result<boolean, StoryRepositoryError>> {
    const existing = await this.db
      .select({
        id: storiesTable.id,
        position: storiesTable.position,
        projectId: storiesTable.projectId,
      })
      .from(storiesTable)
      .where(
        and(eq(storiesTable.projectId, projectId), eq(storiesTable.id, id)),
      )
      .get();

    if (!existing) {
      return ok(false);
    }

    await this.db
      .delete(storiesTable)
      .where(
        and(eq(storiesTable.projectId, projectId), eq(storiesTable.id, id)),
      );

    await this.db
      .update(storiesTable)
      .set({ position: sql`${storiesTable.position} - 1` })
      .where(
        and(
          eq(storiesTable.projectId, existing.projectId),
          sql`${storiesTable.position} > ${existing.position}`,
        ),
      );

    return ok(true);
  }

  async list(
    input: ListStoriesInput,
  ): Promise<Result<Story[], StoryRepositoryError>> {
    const filters = buildListFilters(input);

    const baseQuery = this.db
      .select()
      .from(storiesTable)
      .where(and(...filters));

    const sortedQuery =
      input.order === "statusChangedAtAsc"
        ? baseQuery.orderBy(
            asc(storiesTable.statusChangedAt),
            asc(storiesTable.id),
          )
        : input.order === "statusChangedAtDesc"
          ? baseQuery.orderBy(
              desc(storiesTable.statusChangedAt),
              desc(storiesTable.id),
            )
          : input.order === "currentAcceptedFirst"
            ? baseQuery.orderBy(
                sql`case when ${storiesTable.status} = 'Accepted' then 0 else 1 end`,
                sql`case when ${storiesTable.status} = 'Accepted' then ${storiesTable.statusChangedAt} end asc`,
                asc(storiesTable.position),
                asc(storiesTable.id),
              )
            : baseQuery.orderBy(
                asc(storiesTable.position),
                asc(storiesTable.id),
              );

    const pagedQuery =
      input.limit !== undefined
        ? sortedQuery.limit(input.limit).offset(input.offset ?? 0)
        : sortedQuery;

    const stories = await pagedQuery.all();

    if (input.detailLevel === "summary") {
      return ok(
        await this.enrichSummaryBlockFlags(
          stories.map((row) => {
            return toStorySummary(row);
          }),
        ),
      );
    }

    return ok(await this.listWithRelations(stories));
  }

  async summarize(
    input: ListStoriesInput,
  ): Promise<Result<ListStoriesSummary, StoryRepositoryError>> {
    const filters = buildListFilters(input);
    const whereCondition = and(...filters);
    const [summaryRow] = await this.db
      .select({
        total: sql<number>`count(${storiesTable.id})`,
        totalPoints: sql<number>`coalesce(sum(${storiesTable.storyPoint}), 0)`,
      })
      .from(storiesTable)
      .where(whereCondition)
      .all();
    const pointsByIterationRows = await this.db
      .select({
        iterationId: storiesTable.iterationId,
        totalPoints: sql<number>`coalesce(sum(${storiesTable.storyPoint}), 0)`,
      })
      .from(storiesTable)
      .where(whereCondition)
      .groupBy(storiesTable.iterationId)
      .all();
    const pointsByIterationId: Record<string, number> = {};
    for (const row of pointsByIterationRows) {
      if (!row.iterationId) continue;
      pointsByIterationId[row.iterationId] = row.totalPoints;
    }

    return ok({
      total: summaryRow?.total ?? 0,
      totalPoints: summaryRow?.totalPoints ?? 0,
      pointsByIterationId,
    });
  }

  async reassignStoriesAcrossIterations(
    input: ReassignStoriesAcrossIterationsInput,
  ): Promise<Result<number, StoryRepositoryError>> {
    if (input.statuses.length === 0) {
      return ok(0);
    }

    const updated = await this.db
      .update(storiesTable)
      .set({
        iterationId: input.toIterationId,
        isIcebox: 0,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(
        and(
          eq(storiesTable.projectId, input.projectId),
          eq(storiesTable.iterationId, input.fromIterationId),
          inArray(storiesTable.status, input.statuses),
        ),
      )
      .returning({ id: storiesTable.id });

    return ok(updated.length);
  }

  async reorder(
    input: ReorderStoriesInput,
  ): Promise<Result<Story[] | null, StoryRepositoryError>> {
    const stories = await this.db
      .select({ id: storiesTable.id, position: storiesTable.position })
      .from(storiesTable)
      .where(eq(storiesTable.projectId, input.projectId))
      .orderBy(asc(storiesTable.position), asc(storiesTable.id))
      .all();

    const positionById = new Map(
      stories.map((story) => {
        return [story.id, story.position];
      }),
    );

    const allExist = input.orderedIds.every((id) => {
      return positionById.has(id);
    });

    if (!allExist) {
      return ok(null);
    }

    const currentPositions = input.orderedIds.map((id) => {
      return positionById.get(id) as number;
    });
    const sortedSlots = [...currentPositions].sort((a, b) => {
      return a - b;
    });

    for (let index = 0; index < input.orderedIds.length; index += 1) {
      const storyId = input.orderedIds[index];
      const newPosition = sortedSlots[index];
      const fromPosition = positionById.get(storyId) as number;

      if (fromPosition === newPosition) {
        continue;
      }

      await this.db
        .update(storiesTable)
        .set({
          position: newPosition,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(
            eq(storiesTable.projectId, input.projectId),
            eq(storiesTable.id, storyId),
          ),
        );

      await this.db.insert(storyPriorityHistoryTable).values({
        id: ulid(),
        storyId,
        fromPosition,
        toPosition: newPosition,
      });
    }

    const reordered = await this.db
      .select()
      .from(storiesTable)
      .where(eq(storiesTable.projectId, input.projectId))
      .orderBy(asc(storiesTable.position), asc(storiesTable.id))
      .all();

    return ok(await this.listWithRelations(reordered));
  }

  async listPriorityHistory(
    projectId: string,
  ): Promise<Result<StoryPriorityHistory[], StoryRepositoryError>> {
    const history = await this.db
      .select()
      .from(storyPriorityHistoryTable)
      .innerJoin(
        storiesTable,
        eq(storyPriorityHistoryTable.storyId, storiesTable.id),
      )
      .where(eq(storiesTable.projectId, projectId))
      .orderBy(
        desc(storyPriorityHistoryTable.changedAt),
        desc(storyPriorityHistoryTable.id),
      )
      .all();

    return ok(
      history.map((row) => {
        return toStoryPriorityHistory(row.story_priority_history);
      }),
    );
  }

  async addBlocker(
    blockingStoryId: string,
    blockedStoryId: string,
  ): Promise<Result<void, StoryRepositoryError>> {
    const inserted = await this.db
      .insert(storyBlockersTable)
      .values({
        id: ulid(),
        blockingStoryId,
        blockedStoryId,
      })
      .onConflictDoNothing()
      .returning({ id: storyBlockersTable.id });

    if (inserted.length > 1) {
      return err(STORY_REPOSITORY_ERROR);
    }

    return ok(undefined);
  }

  async removeBlocker(
    blockingStoryId: string,
    blockedStoryId: string,
  ): Promise<Result<boolean, StoryRepositoryError>> {
    const removed = await this.db
      .delete(storyBlockersTable)
      .where(
        and(
          eq(storyBlockersTable.blockingStoryId, blockingStoryId),
          eq(storyBlockersTable.blockedStoryId, blockedStoryId),
        ),
      )
      .returning({ id: storyBlockersTable.id });

    return ok(removed.length > 0);
  }

  async listByOwnerAcrossProjects(
    userId: string,
    projectIds: string[],
  ): Promise<Result<Story[], StoryRepositoryError>> {
    if (projectIds.length === 0) {
      return ok([]);
    }

    const stories = await this.db
      .select()
      .from(storiesTable)
      .where(
        and(
          inArray(storiesTable.projectId, projectIds),
          sql`exists (
            select 1
            from ${storyOwnersTable}
            where ${storyOwnersTable.storyId} = ${storiesTable.id}
              and ${storyOwnersTable.userId} = ${userId}
          )`,
        ),
      )
      .orderBy(
        asc(storiesTable.projectId),
        asc(storiesTable.position),
        asc(storiesTable.id),
      )
      .all();

    return ok(await this.listWithRelations(stories));
  }

  async listAcceptedForIterationRebuild(
    projectId: string,
  ): Promise<Result<AcceptedStoryIterationAnchor[], StoryRepositoryError>> {
    const rows = await this.db
      .select({
        id: storiesTable.id,
        completedAt: storiesTable.completedAt,
        statusChangedAt: storiesTable.statusChangedAt,
      })
      .from(storiesTable)
      .where(
        and(
          eq(storiesTable.projectId, projectId),
          eq(storiesTable.status, "Accepted"),
        ),
      )
      .all();

    return ok(
      rows.map((row) => {
        return {
          id: row.id,
          completedAt: row.completedAt ?? null,
          statusChangedAt: row.statusChangedAt,
        };
      }),
    );
  }
}

// Cloudflare D1 limit: 100 bind parameters per query
const D1_MAX_BIND_PARAMS = 100;
const D1_MAX_BIND_PARAMS_HALF = 50;

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
