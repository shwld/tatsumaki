import { and, asc, eq, sql } from "drizzle-orm";
import { ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type { Epic } from "../../../domain/entities/epic";
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
}
