import { and, asc, eq, sql } from "drizzle-orm";
import { ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type { Epic } from "../../../domain/entities/epic";
import type {
  EpicStory,
  EpicStoryAggregate,
} from "../../../domain/entities/epic-progress";
import type {
  EpicPlanPatch,
  EpicRepository,
  EpicRepositoryError,
} from "../../../domain/repositories/epic-repository";
import { createDb, type DbClient } from "../client";
import { epicsTable } from "../schema/epics";
import { projectLabelsTable } from "../schema/project-labels";

type EpicRow = typeof epicsTable.$inferSelect;
type LabelRow = Pick<typeof projectLabelsTable.$inferSelect, "name" | "color">;

function toEpic(row: EpicRow & { labelId: string }, label: LabelRow): Epic {
  return {
    __typename: "Epic",
    id: row.id,
    projectId: row.projectId,
    labelId: row.labelId,
    labelName: label.name,
    labelColor: label.color,
    enabled: row.enabled,
    description: row.description,
    successCriteria: row.successCriteria,
    ownerId: row.ownerId,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    position: row.position,
    outcomeStatus: row.outcomeStatus,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const UNRESOLVED_BLOCKER = `EXISTS (
  SELECT 1 FROM story_blockers b
  JOIN stories blocker ON blocker.id = b.blocking_story_id
  WHERE b.blocked_story_id = s.id
    AND blocker.archived_at IS NULL
    AND blocker.status NOT IN ('Accepted', 'Rejected')
)`;

const POINT_BASIS = "(s.type = 'feature' AND s.story_point IS NOT NULL)";

const AGGREGATES = `
  count(s.id) AS total,
  coalesce(sum(s.status = 'Accepted'), 0) AS accepted,
  coalesce(sum(s.status <> 'Accepted' AND s.is_icebox = 0 AND s.status <> 'Unstarted'), 0) AS in_progress,
  coalesce(sum(s.status <> 'Accepted' AND s.is_icebox = 0 AND s.status = 'Unstarted'), 0) AS unstarted,
  coalesce(sum(s.status <> 'Accepted' AND s.is_icebox = 1), 0) AS icebox,
  coalesce(sum(s.status <> 'Accepted' AND ${UNRESOLVED_BLOCKER}), 0) AS blocked,
  coalesce(sum(CASE WHEN ${POINT_BASIS} THEN s.story_point ELSE 0 END), 0) AS estimated_points,
  coalesce(sum(CASE WHEN ${POINT_BASIS} AND s.status = 'Accepted' THEN s.story_point ELSE 0 END), 0) AS accepted_points,
  coalesce(sum(s.id IS NOT NULL AND NOT ${POINT_BASIS}), 0) AS excluded_stories`;

type AggregateRow = {
  total: number;
  accepted: number;
  in_progress: number;
  unstarted: number;
  icebox: number;
  blocked: number;
  estimated_points: number;
  accepted_points: number;
  excluded_stories: number;
};

function toAggregate(row: AggregateRow | null): EpicStoryAggregate {
  return {
    total: row?.total ?? 0,
    accepted: row?.accepted ?? 0,
    inProgress: row?.in_progress ?? 0,
    unstarted: row?.unstarted ?? 0,
    icebox: row?.icebox ?? 0,
    blocked: row?.blocked ?? 0,
    estimatedPoints: row?.estimated_points ?? 0,
    acceptedPoints: row?.accepted_points ?? 0,
    excludedStories: row?.excluded_stories ?? 0,
  };
}

export class D1EpicRepository implements EpicRepository {
  private readonly db: DbClient;
  private readonly d1: D1Database;

  constructor(d1: D1Database) {
    this.d1 = d1;
    this.db = createDb(d1);
  }

  private selectWithLabel() {
    return this.db
      .select({
        epic: epicsTable,
        labelId: projectLabelsTable.id,
        labelName: projectLabelsTable.name,
        labelColor: projectLabelsTable.color,
      })
      .from(epicsTable)
      .innerJoin(
        projectLabelsTable,
        and(
          eq(projectLabelsTable.id, epicsTable.labelId),
          eq(projectLabelsTable.projectId, epicsTable.projectId),
        ),
      );
  }

  async list(projectId: string): Promise<Result<Epic[], EpicRepositoryError>> {
    const rows = await this.selectWithLabel()
      .where(eq(epicsTable.projectId, projectId))
      .orderBy(asc(epicsTable.position), asc(epicsTable.createdAt))
      .all();

    return ok(
      rows.map((row) =>
        toEpic(
          { ...row.epic, labelId: row.labelId },
          { name: row.labelName, color: row.labelColor },
        ),
      ),
    );
  }

  async findByLabelId(
    projectId: string,
    labelId: string,
  ): Promise<Result<Epic | null, EpicRepositoryError>> {
    const row = await this.selectWithLabel()
      .where(
        and(
          eq(epicsTable.projectId, projectId),
          eq(epicsTable.labelId, labelId),
        ),
      )
      .get();

    if (!row) {
      return ok(null);
    }
    return ok(
      toEpic(
        { ...row.epic, labelId: row.labelId },
        { name: row.labelName, color: row.labelColor },
      ),
    );
  }

  async createEnabled(
    projectId: string,
    labelId: string,
  ): Promise<Result<Epic | null, EpicRepositoryError>> {
    const now = new Date().toISOString();
    // The label_id unique index makes concurrent first ONs collapse into one epic.
    const result = await this.d1
      .prepare(
        `INSERT INTO epics (id, project_id, name, label_id, enabled, position, revision, created_at, updated_at)
         SELECT ?1, pl.project_id, pl.name, pl.id, 1,
           (SELECT coalesce(max(position), 0) + 1 FROM epics WHERE project_id = ?2),
           1, ?4, ?4
         FROM project_labels pl
         WHERE pl.id = ?3 AND pl.project_id = ?2
         ON CONFLICT(label_id) DO NOTHING`,
      )
      .bind(ulid(), projectId, labelId, now)
      .run();

    if (result.meta.changes === 0) {
      return ok(null);
    }
    return this.findByLabelId(projectId, labelId);
  }

  async setEnabled(
    projectId: string,
    labelId: string,
    enabled: boolean,
    expectedRevision: number,
  ): Promise<Result<Epic | null, EpicRepositoryError>> {
    return this.updateAtRevision(projectId, labelId, expectedRevision, {
      enabled,
    });
  }

  async updatePlan(
    projectId: string,
    labelId: string,
    expectedRevision: number,
    patch: EpicPlanPatch,
  ): Promise<Result<Epic | null, EpicRepositoryError>> {
    return this.updateAtRevision(projectId, labelId, expectedRevision, patch);
  }

  private async updateAtRevision(
    projectId: string,
    labelId: string,
    expectedRevision: number,
    values: EpicPlanPatch & { enabled?: boolean },
  ): Promise<Result<Epic | null, EpicRepositoryError>> {
    const updated = await this.db
      .update(epicsTable)
      .set({
        ...values,
        revision: sql`${epicsTable.revision} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(epicsTable.projectId, projectId),
          eq(epicsTable.labelId, labelId),
          eq(epicsTable.revision, expectedRevision),
        ),
      )
      .returning({ id: epicsTable.id });

    if (updated.length === 0) {
      return ok(null);
    }
    return this.findByLabelId(projectId, labelId);
  }

  async aggregateStories(
    projectId: string,
    labelId?: string,
  ): Promise<
    Result<
      {
        byEpicId: Map<string, EpicStoryAggregate>;
        total: EpicStoryAggregate;
      },
      EpicRepositoryError
    >
  > {
    const labelFilter = labelId === undefined ? "" : "AND e.label_id = ?2";
    const bindings = labelId === undefined ? [projectId] : [projectId, labelId];

    const perEpic = await this.d1
      .prepare(
        `SELECT e.id AS epic_id, ${AGGREGATES}
         FROM epics e
         LEFT JOIN story_labels sl ON sl.label_id = e.label_id AND sl.project_id = e.project_id
         LEFT JOIN stories s ON s.id = sl.story_id AND s.archived_at IS NULL
         WHERE e.project_id = ?1 AND e.enabled = 1 ${labelFilter}
         GROUP BY e.id`,
      )
      .bind(...bindings)
      .all<AggregateRow & { epic_id: string }>();

    const distinct = await this.d1
      .prepare(
        `SELECT ${AGGREGATES}
         FROM (
           SELECT DISTINCT s.*
           FROM epics e
           JOIN story_labels sl ON sl.label_id = e.label_id AND sl.project_id = e.project_id
           JOIN stories s ON s.id = sl.story_id AND s.archived_at IS NULL
           WHERE e.project_id = ?1 AND e.enabled = 1 ${labelFilter}
         ) s`,
      )
      .bind(...bindings)
      .first<AggregateRow>();

    return ok({
      byEpicId: new Map(
        perEpic.results.map((row) => [row.epic_id, toAggregate(row)]),
      ),
      total: toAggregate(distinct),
    });
  }

  async listLabelStories(
    projectId: string,
    labelId: string,
  ): Promise<Result<EpicStory[], EpicRepositoryError>> {
    const rows = await this.d1
      .prepare(
        `SELECT s.id, s.story_number, s.title, s.type, s.status, s.is_icebox, s.story_point,
           (s.status <> 'Accepted' AND ${UNRESOLVED_BLOCKER}) AS is_blocked
         FROM story_labels sl
         JOIN stories s ON s.id = sl.story_id AND s.archived_at IS NULL
         WHERE sl.project_id = ?1 AND sl.label_id = ?2
         ORDER BY s.story_number`,
      )
      .bind(projectId, labelId)
      .all<{
        id: string;
        story_number: number;
        title: string;
        type: string;
        status: string;
        is_icebox: number;
        story_point: number | null;
        is_blocked: number;
      }>();

    return ok(
      rows.results.map((row) => ({
        id: row.id,
        storyNumber: row.story_number,
        title: row.title,
        type: row.type,
        status: row.status,
        isIcebox: row.is_icebox === 1,
        isBlocked: row.is_blocked === 1,
        storyPoint: row.story_point,
      })),
    );
  }
}
