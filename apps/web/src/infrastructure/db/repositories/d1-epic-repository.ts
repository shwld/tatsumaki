import { and, asc, eq } from "drizzle-orm";
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

function toEpic(
  row: EpicRow & { labelId: string },
  label: LabelRow,
  ownerIds: string[],
): Epic {
  return {
    __typename: "Epic",
    id: row.id,
    projectId: row.projectId,
    labelId: row.labelId,
    labelName: label.name,
    labelColor: label.color,
    enabled: row.enabled,
    description: row.description,
    ownerIds,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    position: row.position,
    outcomeStatus: row.outcomeStatus,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const UPDATABLE_COLUMNS: Record<string, string> = {
  enabled: "enabled",
  description: "description",
  plannedStart: "planned_start",
  plannedEnd: "planned_end",
  outcomeStatus: "outcome_status",
};

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

  private async loadOwnerIds(
    projectId: string,
    epicId?: string,
  ): Promise<Map<string, string[]>> {
    const rows = await this.d1
      .prepare(
        `SELECT eo.epic_id, eo.user_id
         FROM epic_owners eo
         JOIN epics e ON e.id = eo.epic_id
         WHERE e.project_id = ?1 AND (?2 IS NULL OR eo.epic_id = ?2)
         ORDER BY eo.created_at, eo.user_id`,
      )
      .bind(projectId, epicId ?? null)
      .all<{ epic_id: string; user_id: string }>();
    const byEpic = new Map<string, string[]>();
    for (const row of rows.results) {
      byEpic.set(row.epic_id, [
        ...(byEpic.get(row.epic_id) ?? []),
        row.user_id,
      ]);
    }
    return byEpic;
  }

  async list(projectId: string): Promise<Result<Epic[], EpicRepositoryError>> {
    const rows = await this.selectWithLabel()
      .where(eq(epicsTable.projectId, projectId))
      .orderBy(asc(epicsTable.position), asc(epicsTable.createdAt))
      .all();
    const owners = await this.loadOwnerIds(projectId);

    return ok(
      rows.map((row) =>
        toEpic(
          { ...row.epic, labelId: row.labelId },
          { name: row.labelName, color: row.labelColor },
          owners.get(row.epic.id) ?? [],
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
    const owners = await this.loadOwnerIds(projectId, row.epic.id);
    return ok(
      toEpic(
        { ...row.epic, labelId: row.labelId },
        { name: row.labelName, color: row.labelColor },
        owners.get(row.epic.id) ?? [],
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
        `INSERT INTO epics (id, project_id, label_id, enabled, position, revision, created_at, updated_at)
         SELECT ?1, pl.project_id, pl.id, 1,
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

  /**
   * Applies the columns and the owner replacement in one batch. The owner
   * statements run only when this batch's update took the revision, so a stale
   * writer changes nothing.
   */
  private async updateAtRevision(
    projectId: string,
    labelId: string,
    expectedRevision: number,
    values: EpicPlanPatch & { enabled?: boolean },
  ): Promise<Result<Epic | null, EpicRepositoryError>> {
    const current = await this.findByLabelId(projectId, labelId);
    if (current.isErr() || !current.value) {
      return current.isErr() ? current : ok(null);
    }
    const epicId = current.value.id;
    const { ownerIds, ...columns } = values;
    const stamp = new Date().toISOString();

    const assignments: string[] = [];
    const bindings: unknown[] = [];
    for (const [key, value] of Object.entries(columns)) {
      if (value === undefined) continue;
      const column = UPDATABLE_COLUMNS[key];
      if (!column) continue;
      bindings.push(typeof value === "boolean" ? Number(value) : value);
      assignments.push(`${column} = ?${bindings.length}`);
    }
    bindings.push(stamp, epicId, projectId, expectedRevision);
    const n = bindings.length;
    const stampIndex = n - 3;

    const statements = [
      this.d1
        .prepare(
          `UPDATE epics SET ${[...assignments, "revision = revision + 1", `updated_at = ?${stampIndex}`].join(", ")}
           WHERE id = ?${n - 2} AND project_id = ?${n - 1} AND revision = ?${n}`,
        )
        .bind(...bindings),
    ];
    if (ownerIds !== undefined) {
      statements.push(
        this.d1
          .prepare(
            `DELETE FROM epic_owners WHERE epic_id = ?1 AND EXISTS (SELECT 1 FROM epics WHERE id = ?1 AND revision = ?2 + 1 AND updated_at = ?3)`,
          )
          .bind(epicId, expectedRevision, stamp),
      );
      for (const userId of ownerIds) {
        statements.push(
          this.d1
            .prepare(
              `INSERT INTO epic_owners (epic_id, user_id, created_at)
               SELECT ?1, ?4, ?3 WHERE EXISTS (SELECT 1 FROM epics WHERE id = ?1 AND revision = ?2 + 1 AND updated_at = ?3)`,
            )
            .bind(epicId, expectedRevision, stamp, userId),
        );
      }
    }
    const results = await this.d1.batch(statements);
    if (results[0].meta.changes === 0) {
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
