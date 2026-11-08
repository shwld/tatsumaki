import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type {
  Story,
  StoryPoint,
  StoryRelation,
  StoryPriorityHistory,
  StoryStatus,
  StoryType,
} from "../../../domain/entities/story";
import {
  INVALID_STORY_IS_ICEBOX_ERROR,
  isResolvedStoryStatus,
  resolveStoryIsIcebox,
  STORY_STATUSES,
} from "../../../domain/entities/story";
import type {
  AcceptedStoryIterationAnchor,
  CreateStoryInput,
  ListStoriesInput,
  ListStoriesSummary,
  ReassignStoriesAcrossIterationsInput,
  ReorderStoriesInput,
  StoryBlockerPair,
  StoryRepository,
  StoryRepositoryError,
  UpdateStoryInput,
} from "../../../domain/repositories/story-repository";
import {
  STORY_OWNER_NOT_PROJECT_MEMBER_ERROR,
  STORY_REPOSITORY_ERROR,
  STORY_STATUS_CHANGED_CONCURRENTLY_ERROR,
  STORY_ARCHIVED_ERROR,
  STORY_LABEL_NOT_IN_PROJECT_ERROR,
  STORY_REQUESTER_NOT_PROJECT_MEMBER_ERROR,
} from "../../../domain/repositories/story-repository";
import { todayIso } from "../../../shared/date/today-iso";
import { createDb, type DbClient } from "../client";
import { iterationsTable } from "../schema/iterations";
import { projectLabelsTable } from "../schema/project-labels";
import { projectMembersTable } from "../schema/project-members";
import { storyBlockersTable } from "../schema/story-blockers";
import { storyLabelsTable } from "../schema/story-labels";
import {
  storyOwnersTable,
  storyPriorityHistoryTable,
  storiesTable,
} from "../schema/stories";

type StoryRow = typeof storiesTable.$inferSelect;
type StoryPriorityHistoryRow = typeof storyPriorityHistoryTable.$inferSelect;
type StoryBlockerRow = typeof storyBlockersTable.$inferSelect;

type StoryLabelsByStoryId = ReadonlyMap<
  string,
  { ids: string[]; names: string[] }
>;

function toStoryRelation(row: {
  id: string;
  storyNumber: number;
  title: string;
  status: string;
}): StoryRelation {
  return {
    id: row.id,
    storyNumber: row.storyNumber,
    title: row.title,
    status: STORY_STATUSES.includes(row.status as StoryStatus)
      ? (row.status as StoryStatus)
      : "Unstarted",
  };
}

function toStory(
  row: StoryRow,
  ownerIdsByStoryId: ReadonlyMap<string, string[]>,
  labelsByStoryId: StoryLabelsByStoryId,
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
    archivedAt: row.archivedAt,
    storyPoint,
    labels: labelsByStoryId.get(row.id)?.names ?? [],
    labelIds: labelsByStoryId.get(row.id)?.ids ?? [],
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

function toStorySummary(
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
    description: "",
    type: row.type as StoryType,
    status,
    statusChangedAt: row.statusChangedAt,
    completedAt: row.completedAt ?? null,
    archivedAt: row.archivedAt,
    storyPoint,
    labels: [],
    labelIds: [],
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

function storyHasAnyLabelNamed(names: string[]): SQL {
  return sql`exists (
    select 1
    from ${storyLabelsTable}
    join ${projectLabelsTable}
      on ${projectLabelsTable.id} = ${storyLabelsTable.labelId}
    where ${storyLabelsTable.storyId} = ${storiesTable.id}
      and ${inArray(projectLabelsTable.name, names)}
  )`;
}

function buildListFilters(input: ListStoriesInput): SQL[] {
  const filters: SQL[] = [eq(storiesTable.projectId, input.projectId)];
  if (input.archived !== "include") {
    filters.push(
      input.archived === "only"
        ? isNotNull(storiesTable.archivedAt)
        : isNull(storiesTable.archivedAt),
    );
  }
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
    filters.push(storyHasAnyLabelNamed([input.label]));
  }

  if (Array.isArray(input.labels) && input.labels.length > 0) {
    filters.push(storyHasAnyLabelNamed(input.labels));
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
          from ${storyLabelsTable}
          join ${projectLabelsTable}
            on ${projectLabelsTable.id} = ${storyLabelsTable.labelId}
          where ${storyLabelsTable.storyId} = ${storiesTable.id}
            and lower(${projectLabelsTable.name}) like ${like} escape '\\'
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
    relationByStoryId: Map<string, StoryRelation>,
  ): Story[] {
    const storyById = new Map(
      stories.map((story) => {
        return [story.id, story];
      }),
    );

    const activelyBlockedIds = new Set<string>();
    for (const row of blockerRows) {
      const blocking = storyById.get(row.blockingStoryId);
      const blocked = storyById.get(row.blockedStoryId);
      if (!blocking && !blocked) {
        continue;
      }

      const blockingRelation = relationByStoryId.get(row.blockingStoryId);
      const blockedRelation = relationByStoryId.get(row.blockedStoryId);
      if (!blockingRelation || !blockedRelation) {
        continue;
      }

      if (blocked) {
        blocked.blockingStories = [
          ...(blocked.blockingStories ?? []),
          blockingRelation,
        ];
        if (
          !blocking?.archivedAt &&
          !isResolvedStoryStatus(blockingRelation.status)
        ) {
          activelyBlockedIds.add(blocked.id);
        }
      }

      if (blocking) {
        blocking.blockedStories = [
          ...(blocking.blockedStories ?? []),
          blockedRelation,
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
      story.isBlocked = activelyBlockedIds.has(story.id);
      story.isBlocking =
        !story.archivedAt &&
        !isResolvedStoryStatus(story.status) &&
        (story.blockedStories?.length ?? 0) > 0;
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

  private async listLabelsByStoryIds(
    storyIds: string[],
  ): Promise<Map<string, { ids: string[]; names: string[] }>> {
    const labelsByStoryId = new Map<
      string,
      { ids: string[]; names: string[] }
    >();
    for (const chunk of chunkArray(storyIds, D1_MAX_BIND_PARAMS)) {
      const rows = await this.db
        .select({
          storyId: storyLabelsTable.storyId,
          labelId: projectLabelsTable.id,
          name: projectLabelsTable.name,
        })
        .from(storyLabelsTable)
        .innerJoin(
          projectLabelsTable,
          eq(projectLabelsTable.id, storyLabelsTable.labelId),
        )
        .where(inArray(storyLabelsTable.storyId, chunk))
        .orderBy(asc(storyLabelsTable.storyId), asc(projectLabelsTable.name))
        .all();
      for (const row of rows) {
        const current = labelsByStoryId.get(row.storyId) ?? {
          ids: [],
          names: [],
        };
        current.ids.push(row.labelId);
        current.names.push(row.name);
        labelsByStoryId.set(row.storyId, current);
      }
    }
    return labelsByStoryId;
  }

  private async assertLabelIdsBelongToProject(
    projectId: string,
    labelIds: string[],
  ): Promise<Result<void, StoryRepositoryError>> {
    const uniqueIds = [...new Set(labelIds)];
    for (const chunk of chunkArray(uniqueIds, D1_MAX_BIND_PARAMS - 1)) {
      const rows = await this.db
        .select({ id: projectLabelsTable.id })
        .from(projectLabelsTable)
        .where(
          and(
            eq(projectLabelsTable.projectId, projectId),
            inArray(projectLabelsTable.id, chunk),
          ),
        )
        .all();
      if (rows.length !== chunk.length) {
        return err(STORY_LABEL_NOT_IN_PROJECT_ERROR);
      }
    }
    return ok(undefined);
  }

  // Label edits are idempotent inserts and deletes keyed by (story, label), so concurrent edits never remove labels they did not name.
  private buildLabelStatements(
    projectId: string,
    storyId: string,
    input: Pick<
      UpdateStoryInput,
      "labelIds" | "addLabelIds" | "removeLabelIds" | "labels" | "addLabelNames"
    >,
  ): BatchItem<"sqlite">[] {
    const statements: BatchItem<"sqlite">[] = [];
    const names = [
      ...new Set([...(input.labels ?? []), ...(input.addLabelNames ?? [])]),
    ];
    if (names.length > 0) {
      statements.push(
        this.db
          .insert(projectLabelsTable)
          .values(
            names.map((name) => ({
              id: ulid(),
              projectId,
              name,
            })),
          )
          .onConflictDoNothing(),
      );
    }

    const wantedLabelIds = (
      ids: string[] | undefined,
      byName: string[] | undefined,
    ) => {
      const conditions: SQL[] = [];
      if (ids && ids.length > 0)
        conditions.push(inArray(projectLabelsTable.id, ids));
      if (byName && byName.length > 0)
        conditions.push(inArray(projectLabelsTable.name, byName));
      const matched = or(...conditions);
      return this.db
        .select({ id: projectLabelsTable.id })
        .from(projectLabelsTable)
        .where(
          matched
            ? and(eq(projectLabelsTable.projectId, projectId), matched)
            : sql`0 = 1`,
        );
    };

    const replacesAll =
      input.labelIds !== undefined || input.labels !== undefined;
    if (replacesAll) {
      const keep = wantedLabelIds(input.labelIds, input.labels);
      statements.push(
        this.db
          .delete(storyLabelsTable)
          .where(
            and(
              eq(storyLabelsTable.storyId, storyId),
              sql`${storyLabelsTable.labelId} not in (${keep})`,
            ),
          ),
      );
    }

    if (input.removeLabelIds && input.removeLabelIds.length > 0) {
      statements.push(
        this.db
          .delete(storyLabelsTable)
          .where(
            and(
              eq(storyLabelsTable.storyId, storyId),
              inArray(storyLabelsTable.labelId, input.removeLabelIds),
            ),
          ),
      );
    }

    const addIds = [...(input.labelIds ?? []), ...(input.addLabelIds ?? [])];
    const addNames = [...(input.labels ?? []), ...(input.addLabelNames ?? [])];
    if (addIds.length > 0 || addNames.length > 0) {
      const conditions: SQL[] = [];
      if (addIds.length > 0)
        conditions.push(inArray(projectLabelsTable.id, addIds));
      if (addNames.length > 0)
        conditions.push(inArray(projectLabelsTable.name, addNames));
      statements.push(
        this.db
          .insert(storyLabelsTable)
          .select(
            this.db
              .select({
                projectId: sql<string>`${projectId}`.as("project_id"),
                storyId: sql<string>`${storyId}`.as("story_id"),
                labelId: projectLabelsTable.id,
                createdAt: sql<string>`CURRENT_TIMESTAMP`.as("created_at"),
              })
              .from(projectLabelsTable)
              .where(
                and(
                  eq(projectLabelsTable.projectId, projectId),
                  or(...conditions),
                ),
              ),
          )
          .onConflictDoNothing(),
      );
    }

    return statements;
  }

  private async validateLabelInput(
    projectId: string,
    input: Pick<UpdateStoryInput, "labelIds" | "addLabelIds">,
  ): Promise<Result<void, StoryRepositoryError>> {
    return this.assertLabelIdsBelongToProject(projectId, [
      ...(input.labelIds ?? []),
      ...(input.addLabelIds ?? []),
    ]);
  }

  private async listWithRelations(rows: StoryRow[]): Promise<Story[]> {
    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((story) => {
      return story.id;
    });
    const ownerIdsByStoryId = await this.listOwnerIdsByStoryIds(ids);
    const labelsByStoryId = await this.listLabelsByStoryIds(ids);
    const stories = rows.map((row) => {
      return toStory(row, ownerIdsByStoryId, labelsByStoryId);
    });

    const relationByStoryId = new Map(
      stories.map((story) => {
        return [story.id, toStoryRelation(story)];
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

    return this.attachStoryRelations(stories, blockerRows, relationByStoryId);
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
          .where(
            and(
              inArray(storyBlockersTable.blockedStoryId, chunk),
              sql`exists (select 1 from stories where id = ${storyBlockersTable.blockingStoryId} and archived_at is null and status not in ('Accepted', 'Rejected'))`,
            ),
          )
          .all(),
        this.db
          .select({ id: storyBlockersTable.blockingStoryId })
          .from(storyBlockersTable)
          .where(
            and(
              inArray(storyBlockersTable.blockingStoryId, chunk),
              sql`exists (select 1 from stories where id = ${storyBlockersTable.blockedStoryId} and archived_at is null)`,
            ),
          )
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
      story.isBlocking =
        !story.archivedAt &&
        !isResolvedStoryStatus(story.status) &&
        blockingStoryIds.has(story.id);
    }
    return stories;
  }

  private async findStoryRelationsByIds(
    projectId: string,
    ids: string[],
  ): Promise<Map<string, StoryRelation>> {
    if (ids.length === 0) {
      return new Map();
    }

    const uniqueIds = Array.from(new Set(ids));
    // D1 has a limit of 100 bind parameters per query (projectId uses 1)
    const chunks = chunkArray(uniqueIds, D1_MAX_BIND_PARAMS - 1);
    const allRows = [];
    for (const chunk of chunks) {
      const rows = await this.db
        .select({
          id: storiesTable.id,
          storyNumber: storiesTable.storyNumber,
          title: storiesTable.title,
          status: storiesTable.status,
        })
        .from(storiesTable)
        .where(
          and(
            eq(storiesTable.projectId, projectId),
            isNull(storiesTable.archivedAt),
            inArray(storiesTable.id, chunk),
          ),
        )
        .all();
      allRows.push(...rows);
    }

    return new Map(
      allRows.map((row) => {
        return [row.id, toStoryRelation(row)];
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
    const labelsByStoryId = await this.listLabelsByStoryIds([row.id]);
    const story = toStory(row, ownerIdsByStoryId, labelsByStoryId);
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
    const relationByStoryId = await this.findStoryRelationsByIds(projectId, [
      id,
      ...relatedIds,
    ]);
    relationByStoryId.set(id, toStoryRelation(story));

    return this.attachStoryRelations(
      [story],
      blockerRows,
      relationByStoryId,
    )[0];
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

  // 既存 owner は脱退済みでも保持し、新規 owner だけを project member に限る。
  // owner ID は JSON 配列 1 つの bind にまとめ、D1 の bind 数上限に人数が影響しないようにする。
  private buildOwnerReplacementStatements(
    projectId: string,
    storyId: string,
    current: { status: string; isIcebox: number; iterationId: string | null },
    ownerIds: string[],
  ) {
    const wantedOwnerIds = sql`select value from json_each(${JSON.stringify([...new Set(ownerIds)])})`;
    const storyUnchanged = sql`exists (select 1 from ${storiesTable} as target where target.id = ${storyId} and target.status = ${current.status} and target.is_icebox = ${current.isIcebox} and ${
      current.iterationId === null
        ? sql`target.iteration_id is null`
        : sql`target.iteration_id = ${current.iterationId}`
    } and target.archived_at is null)`;
    const everyOwnerIsCurrentOrMember = sql`not exists (select 1 from (${wantedOwnerIds}) as wanted where wanted.value not in (select ${storyOwnersTable.userId} from ${storyOwnersTable} where ${storyOwnersTable.storyId} = ${storyId}) and wanted.value not in (select ${projectMembersTable.userId} from ${projectMembersTable} where ${projectMembersTable.projectId} = ${projectId}))`;
    const guard = sql`${storyUnchanged} and ${everyOwnerIsCurrentOrMember}`;

    const removeStatement = this.db
      .delete(storyOwnersTable)
      .where(
        and(
          eq(storyOwnersTable.storyId, storyId),
          sql`${storyOwnersTable.userId} not in (${wantedOwnerIds})`,
          guard,
        ),
      );
    if (ownerIds.length === 0) {
      return [removeStatement];
    }
    const addStatement = this.db.insert(storyOwnersTable).select(
      this.db
        .select({
          storyId: sql<string>`${storyId}`.as("story_id"),
          userId: projectMembersTable.userId,
          createdAt: sql<string>`CURRENT_TIMESTAMP`.as("created_at"),
          updatedAt: sql<string>`CURRENT_TIMESTAMP`.as("updated_at"),
        })
        .from(projectMembersTable)
        .where(
          and(
            eq(projectMembersTable.projectId, projectId),
            sql`${projectMembersTable.userId} in (${wantedOwnerIds})`,
            sql`not exists (select 1 from ${storyOwnersTable} where ${storyOwnersTable.storyId} = ${storyId} and ${storyOwnersTable.userId} = ${projectMembersTable.userId})`,
            guard,
          ),
        ),
    );
    return [removeStatement, addStatement];
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
    const labelValidation = await this.validateLabelInput(input.projectId, {
      labelIds: input.labelIds,
    });
    if (labelValidation.isErr()) {
      return err(labelValidation.error);
    }

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

    const labelStatements = this.buildLabelStatements(
      input.projectId,
      inserted.id,
      { labelIds: input.labelIds, addLabelNames: input.labels },
    );
    if (labelStatements.length > 0) {
      await this.db.batch(
        labelStatements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
      );
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

    if (current.archivedAt !== null) {
      return err(STORY_ARCHIVED_ERROR);
    }

    const labelValidation = await this.validateLabelInput(
      input.projectId,
      input,
    );
    if (labelValidation.isErr()) {
      return err(labelValidation.error);
    }

    const currentOwnerIdSet = new Set(
      input.ownerIds === undefined
        ? []
        : ((await this.listOwnerIdsByStoryIds([input.id])).get(input.id) ?? []),
    );
    if (input.ownerIds !== undefined) {
      // 脱退済みメンバーが owner に残る状態は正常。検証するのは新規に追加される owner のみ。
      const ownerValidation = await this.assertOwnerIdsAreProjectMembers(
        input.projectId,
        input.ownerIds.filter((ownerId) => {
          return !currentOwnerIdSet.has(ownerId);
        }),
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

    if (
      input.expectedStatus !== undefined &&
      input.expectedStatus !== current.status
    ) {
      return err(STORY_STATUS_CHANGED_CONCURRENTLY_ERROR);
    }

    const shouldUpdateStatusTimestamp =
      input.status !== undefined && input.status !== current.status;
    const nextStatus = (input.status ?? current.status) as StoryStatus;
    // Re-resolve against the row just read so a concurrent writer cannot make
    // the use case's earlier snapshot produce an invalid Icebox/status pair.
    const resolvedIsIcebox = resolveStoryIsIcebox({
      requested: input.isIcebox,
      current: {
        isIcebox: current.isIcebox === 1,
        iterationId: current.iterationId,
      },
      nextStatus,
    });
    if (resolvedIsIcebox.isErr()) {
      return err(INVALID_STORY_IS_ICEBOX_ERROR);
    }
    const nextIsIcebox = resolvedIsIcebox.value ?? current.isIcebox === 1;

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

    const ownerStatements =
      input.ownerIds === undefined
        ? []
        : this.buildOwnerReplacementStatements(
            input.projectId,
            input.id,
            current,
            input.ownerIds,
          );
    const ownerIdsAreAllCurrentOwners =
      input.ownerIds === undefined || input.ownerIds.length === 0
        ? sql`1 = 1`
        : sql`not exists (select 1 from json_each(${JSON.stringify([...new Set(input.ownerIds)])}) as wanted where wanted.value not in (select ${storyOwnersTable.userId} from ${storyOwnersTable} where ${storyOwnersTable.storyId} = ${input.id}))`;
    const shouldMoveToTop =
      input.moveToTop === true && current.isIcebox === 1 && !nextIsIcebox;
    const updateQuery = this.db
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
        ...(input.requesterId !== undefined
          ? { requesterId: input.requesterId }
          : {}),
        ...(input.releaseDate !== undefined
          ? { releaseDate: input.releaseDate }
          : {}),
        ...(resolvedIsIcebox.value !== undefined
          ? { isIcebox: resolvedIsIcebox.value ? 1 : 0 }
          : {}),
        ...(shouldMoveToTop ? { position: 1 } : {}),
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
          isNull(storiesTable.archivedAt),
          // Optimistic guard on the columns the Icebox invariant depends on.
          eq(storiesTable.status, current.status),
          eq(storiesTable.isIcebox, current.isIcebox),
          current.iterationId === null
            ? isNull(storiesTable.iterationId)
            : eq(storiesTable.iterationId, current.iterationId),
          // Owners are replaced before this statement in the same batch; the
          // story only updates when that replacement took effect.
          ownerIdsAreAllCurrentOwners,
        ),
      )
      .returning({ id: storiesTable.id });

    // Owner replacement, the position shift and the story update must commit
    // together, and each step only applies while the optimistic guard on the
    // target still holds.
    const shiftStatement = shouldMoveToTop
      ? [
          this.db
            .update(storiesTable)
            .set({
              position: sql`${storiesTable.position} + 1`,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
              and(
                eq(storiesTable.projectId, input.projectId),
                ne(storiesTable.id, input.id),
                sql`exists (select 1 from ${storiesTable} as target where target.id = ${input.id} and target.status = ${current.status} and target.is_icebox = ${current.isIcebox} and target.archived_at is null)`,
                ownerIdsAreAllCurrentOwners,
              ),
            ),
        ]
      : [];
    const labelStatements = this.buildLabelStatements(
      input.projectId,
      input.id,
      input,
    );
    const preStatements: BatchItem<"sqlite">[] = [
      ...labelStatements,
      ...ownerStatements,
      ...shiftStatement,
    ];
    const batchStatements: BatchItem<"sqlite">[] = [
      ...preStatements,
      updateQuery,
    ];
    const updatedRows =
      preStatements.length === 0
        ? await updateQuery
        : ((
            await this.db.batch(
              batchStatements as [
                BatchItem<"sqlite">,
                ...BatchItem<"sqlite">[],
              ],
            )
          )[preStatements.length] as { id: string }[]);

    if (updatedRows.length === 0) {
      if (input.ownerIds !== undefined) {
        const ownerRecheck = await this.assertOwnerIdsAreProjectMembers(
          input.projectId,
          input.ownerIds.filter((ownerId) => {
            return !currentOwnerIdSet.has(ownerId);
          }),
        );
        if (ownerRecheck.isErr()) return err(ownerRecheck.error);
      }
      const latest = await this.db
        .select({ archivedAt: storiesTable.archivedAt })
        .from(storiesTable)
        .where(
          and(
            eq(storiesTable.projectId, input.projectId),
            eq(storiesTable.id, input.id),
          ),
        )
        .get();
      if (latest?.archivedAt) return err(STORY_ARCHIVED_ERROR);
      return err(
        input.expectedStatus !== undefined
          ? STORY_STATUS_CHANGED_CONCURRENTLY_ERROR
          : STORY_REPOSITORY_ERROR,
      );
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
      const ownerIdsByStoryId = await this.listOwnerIdsByStoryIds(
        stories.map((story) => story.id),
      );
      return ok(
        await this.enrichSummaryBlockFlags(
          stories.map((row) => {
            return toStorySummary(row, ownerIdsByStoryId);
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
          isNull(storiesTable.archivedAt),
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
      .where(
        and(
          eq(storiesTable.projectId, input.projectId),
          isNull(storiesTable.archivedAt),
        ),
      )
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

    const moves = input.orderedIds.flatMap((storyId, index) => {
      const toPosition = sortedSlots[index];
      const fromPosition = positionById.get(storyId) as number;
      return fromPosition === toPosition
        ? []
        : [{ storyId, fromPosition, toPosition }];
    });

    if (moves.length > 0) {
      // Every statement is guarded on the same condition so a concurrent
      // archive of any reordered story leaves positions and history untouched.
      const noneArchived = sql`not exists (select 1 from ${storiesTable} where ${storiesTable.projectId} = ${input.projectId} and ${storiesTable.id} in (select value from json_each(${JSON.stringify(input.orderedIds)})) and ${storiesTable.archivedAt} is not null)`;
      const [firstUpdate, ...rest] = moves.map((move) =>
        this.db
          .update(storiesTable)
          .set({
            position: move.toPosition,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(
            and(
              eq(storiesTable.projectId, input.projectId),
              eq(storiesTable.id, move.storyId),
              noneArchived,
            ),
          )
          .returning({ id: storiesTable.id }),
      );
      const history = moves.map((move) =>
        this.db
          .insert(storyPriorityHistoryTable)
          .select(
            sql`select ${ulid()}, ${move.storyId}, ${move.fromPosition}, ${move.toPosition}, CURRENT_TIMESTAMP where ${noneArchived}`,
          ),
      );
      const [firstResult] = await this.db.batch([
        firstUpdate,
        ...rest,
        ...history,
      ]);
      if (firstResult.length === 0) return err(STORY_ARCHIVED_ERROR);
    }

    const reordered = await this.db
      .select()
      .from(storiesTable)
      .where(
        and(
          eq(storiesTable.projectId, input.projectId),
          isNull(storiesTable.archivedAt),
        ),
      )
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
  ): Promise<Result<boolean, StoryRepositoryError>> {
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

    return ok(inserted.length === 1);
  }

  async listBlockerPairs(
    projectId: string,
  ): Promise<Result<StoryBlockerPair[], StoryRepositoryError>> {
    const rows = await this.db
      .select({
        blockingStoryId: storyBlockersTable.blockingStoryId,
        blockedStoryId: storyBlockersTable.blockedStoryId,
      })
      .from(storyBlockersTable)
      .innerJoin(
        storiesTable,
        eq(storiesTable.id, storyBlockersTable.blockingStoryId),
      )
      .where(eq(storiesTable.projectId, projectId))
      .all();

    return ok(rows);
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
          isNull(storiesTable.archivedAt),
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
