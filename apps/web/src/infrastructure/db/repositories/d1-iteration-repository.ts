import { and, asc, desc, eq, sql } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import {
  type Iteration,
  type IterationOverride,
  isValidSprintUtilizationPercent,
} from "../../../domain/entities/iteration";
import type {
  AssignStoryInput,
  CreateIterationInput,
  IterationRepository,
  IterationRepositoryError,
  UnassignStoryInput,
  UpdateIterationUtilizationInput,
} from "../../../domain/repositories/iteration-repository";
import {
  ITERATION_DATE_OVERLAP_ERROR,
  ITERATION_NOT_FOUND_ERROR,
  ITERATION_REPOSITORY_ERROR,
} from "../../../domain/repositories/iteration-repository";
import { createDb, type DbClient } from "../client";
import { iterationsTable } from "../schema/iterations";
import { iterationOverridesTable } from "../schema/iteration-overrides";
import { storiesTable } from "../schema/stories";

type IterationRow = typeof iterationsTable.$inferSelect;
type IterationOverrideRow = typeof iterationOverridesTable.$inferSelect;

function toIteration(
  row: IterationRow,
  totalPoints: number,
  overridePercent?: number | null,
): Iteration {
  const effectivePercent = isValidSprintUtilizationPercent(
    overridePercent ?? NaN,
  )
    ? (overridePercent as number)
    : 100;
  return {
    __typename: "Iteration",
    id: row.id,
    projectId: row.projectId,
    iterationNumber: row.iterationNumber,
    startDate: row.startDate,
    endDate: row.endDate,
    totalPoints,
    effectiveSprintUtilizationPercent: effectivePercent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toIterationOverride(row: IterationOverrideRow): IterationOverride {
  return {
    __typename: "IterationOverride",
    id: row.id,
    projectId: row.projectId,
    iterationNumber: row.iterationNumber,
    sprintUtilizationPercent: row.sprintUtilizationPercent,
    iterationStartDate: row.iterationStartDate,
    iterationEndDate: row.iterationEndDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class D1IterationRepository implements IterationRepository {
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async create(
    input: CreateIterationInput,
  ): Promise<Result<Iteration, IterationRepositoryError>> {
    // Check for overlapping iterations
    const overlap = await this.db
      .select({ id: iterationsTable.id })
      .from(iterationsTable)
      .where(
        and(
          eq(iterationsTable.projectId, input.projectId),
          sql`${iterationsTable.startDate} < ${input.endDate}`,
          sql`${iterationsTable.endDate} > ${input.startDate}`,
        ),
      )
      .get();

    if (overlap) {
      return err(ITERATION_DATE_OVERLAP_ERROR);
    }

    const now = new Date().toISOString();
    const id = ulid();
    const maxNumberRow = await this.db
      .select({
        maxIterationNumber:
          sql<number>`coalesce(max(${iterationsTable.iterationNumber}), 0)`.as(
            "max_iteration_number",
          ),
      })
      .from(iterationsTable)
      .where(eq(iterationsTable.projectId, input.projectId))
      .get();
    const nextIterationNumber = (maxNumberRow?.maxIterationNumber ?? 0) + 1;

    await this.db.insert(iterationsTable).values({
      id,
      projectId: input.projectId,
      iterationNumber: nextIterationNumber,
      startDate: input.startDate,
      endDate: input.endDate,
      createdAt: now,
      updatedAt: now,
    });

    const created = await this.db
      .select()
      .from(iterationsTable)
      .where(eq(iterationsTable.id, id))
      .get();

    if (!created) {
      return err(ITERATION_REPOSITORY_ERROR);
    }

    return ok(toIteration(created, 0, null));
  }

  async list(
    projectId: string,
  ): Promise<Result<Iteration[], IterationRepositoryError>> {
    const rows = await this.db
      .select({
        iteration: iterationsTable,
        totalPoints:
          sql<number>`coalesce(sum(case when ${storiesTable.status} = 'Accepted' then ${storiesTable.storyPoint} else 0 end), 0)`.as(
            "total_points",
          ),
        overridePercent: sql<
          number | null
        >`max(${iterationOverridesTable.sprintUtilizationPercent})`.as(
          "override_percent",
        ),
      })
      .from(iterationsTable)
      .leftJoin(storiesTable, eq(storiesTable.iterationId, iterationsTable.id))
      .leftJoin(
        iterationOverridesTable,
        and(
          eq(iterationOverridesTable.projectId, iterationsTable.projectId),
          eq(
            iterationOverridesTable.iterationNumber,
            iterationsTable.iterationNumber,
          ),
        ),
      )
      .where(eq(iterationsTable.projectId, projectId))
      .groupBy(iterationsTable.id)
      .orderBy(asc(iterationsTable.startDate))
      .all();

    return ok(
      rows.map((row) =>
        toIteration(row.iteration, row.totalPoints ?? 0, row.overridePercent),
      ),
    );
  }

  async findById(
    projectId: string,
    id: string,
  ): Promise<Result<Iteration | null, IterationRepositoryError>> {
    const row = await this.db
      .select({
        iteration: iterationsTable,
        totalPoints:
          sql<number>`coalesce(sum(${storiesTable.storyPoint}), 0)`.as(
            "total_points",
          ),
        overridePercent: sql<
          number | null
        >`max(${iterationOverridesTable.sprintUtilizationPercent})`.as(
          "override_percent",
        ),
      })
      .from(iterationsTable)
      .leftJoin(storiesTable, eq(storiesTable.iterationId, iterationsTable.id))
      .leftJoin(
        iterationOverridesTable,
        and(
          eq(iterationOverridesTable.projectId, iterationsTable.projectId),
          eq(
            iterationOverridesTable.iterationNumber,
            iterationsTable.iterationNumber,
          ),
        ),
      )
      .where(
        and(
          eq(iterationsTable.projectId, projectId),
          eq(iterationsTable.id, id),
        ),
      )
      .groupBy(iterationsTable.id)
      .get();

    if (!row) {
      return ok(null);
    }

    return ok(
      toIteration(row.iteration, row.totalPoints ?? 0, row.overridePercent),
    );
  }

  async findLatest(
    projectId: string,
  ): Promise<Result<Iteration | null, IterationRepositoryError>> {
    const row = await this.db
      .select({
        iteration: iterationsTable,
        totalPoints:
          sql<number>`coalesce(sum(case when ${storiesTable.status} = 'Accepted' then ${storiesTable.storyPoint} else 0 end), 0)`.as(
            "total_points",
          ),
        overridePercent: sql<
          number | null
        >`max(${iterationOverridesTable.sprintUtilizationPercent})`.as(
          "override_percent",
        ),
      })
      .from(iterationsTable)
      .leftJoin(storiesTable, eq(storiesTable.iterationId, iterationsTable.id))
      .leftJoin(
        iterationOverridesTable,
        and(
          eq(iterationOverridesTable.projectId, iterationsTable.projectId),
          eq(
            iterationOverridesTable.iterationNumber,
            iterationsTable.iterationNumber,
          ),
        ),
      )
      .where(eq(iterationsTable.projectId, projectId))
      .groupBy(iterationsTable.id)
      .orderBy(desc(iterationsTable.endDate))
      .limit(1)
      .get();

    if (!row) {
      return ok(null);
    }

    return ok(
      toIteration(row.iteration, row.totalPoints ?? 0, row.overridePercent),
    );
  }

  async delete(
    projectId: string,
    id: string,
  ): Promise<Result<boolean, IterationRepositoryError>> {
    // Unassign stories first
    await this.db
      .update(storiesTable)
      .set({ iterationId: null, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(storiesTable.iterationId, id));

    const removed = await this.db
      .delete(iterationsTable)
      .where(
        and(
          eq(iterationsTable.projectId, projectId),
          eq(iterationsTable.id, id),
        ),
      )
      .returning({ id: iterationsTable.id });

    return ok(removed.length > 0);
  }

  async deleteFuture(
    projectId: string,
    date: string,
  ): Promise<Result<number, IterationRepositoryError>> {
    // Find future iteration IDs to unassign their stories
    const futureIds = await this.db
      .select({ id: iterationsTable.id })
      .from(iterationsTable)
      .where(
        and(
          eq(iterationsTable.projectId, projectId),
          sql`${iterationsTable.startDate} > ${date}`,
        ),
      )
      .all();

    // Unassign stories from future iterations
    for (const { id } of futureIds) {
      await this.db
        .update(storiesTable)
        .set({ iterationId: null, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(storiesTable.iterationId, id));
    }

    // Delete future iterations
    const removed = await this.db
      .delete(iterationsTable)
      .where(
        and(
          eq(iterationsTable.projectId, projectId),
          sql`${iterationsTable.startDate} > ${date}`,
        ),
      )
      .returning({ id: iterationsTable.id });

    return ok(removed.length);
  }

  async deleteAll(
    projectId: string,
  ): Promise<Result<number, IterationRepositoryError>> {
    const removed = await this.db
      .delete(iterationsTable)
      .where(eq(iterationsTable.projectId, projectId))
      .returning({ id: iterationsTable.id });

    return ok(removed.length);
  }

  async assignStory(
    input: AssignStoryInput,
  ): Promise<Result<boolean, IterationRepositoryError>> {
    // Verify iteration exists
    const iteration = await this.db
      .select({ id: iterationsTable.id })
      .from(iterationsTable)
      .where(
        and(
          eq(iterationsTable.projectId, input.projectId),
          eq(iterationsTable.id, input.iterationId),
        ),
      )
      .get();

    if (!iteration) {
      return err(ITERATION_NOT_FOUND_ERROR);
    }

    // Verify story exists in same project
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
      return ok(false);
    }

    await this.db
      .update(storiesTable)
      .set({
        iterationId: input.iterationId,
        isIcebox: 0,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(storiesTable.id, input.storyId));

    return ok(true);
  }

  async unassignStory(
    input: UnassignStoryInput,
  ): Promise<Result<boolean, IterationRepositoryError>> {
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
      return ok(false);
    }

    await this.db
      .update(storiesTable)
      .set({
        iterationId: null,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(storiesTable.id, input.storyId));

    return ok(true);
  }

  async updateUtilization(
    input: UpdateIterationUtilizationInput,
  ): Promise<Result<IterationOverride, IterationRepositoryError>> {
    const referenceDateRange = await this.resolveOverrideDateRange(input);

    const existing = await this.db
      .select()
      .from(iterationOverridesTable)
      .where(
        and(
          eq(iterationOverridesTable.projectId, input.projectId),
          eq(iterationOverridesTable.iterationNumber, input.iterationNumber),
        ),
      )
      .get();

    if (existing) {
      await this.db
        .update(iterationOverridesTable)
        .set({
          sprintUtilizationPercent: input.sprintUtilizationPercent,
          iterationStartDate:
            referenceDateRange.startDate ?? existing.iterationStartDate,
          iterationEndDate:
            referenceDateRange.endDate ?? existing.iterationEndDate,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(iterationOverridesTable.id, existing.id));

      const updated = await this.db
        .select()
        .from(iterationOverridesTable)
        .where(eq(iterationOverridesTable.id, existing.id))
        .get();
      if (!updated) {
        return err(ITERATION_REPOSITORY_ERROR);
      }
      return ok(toIterationOverride(updated));
    }

    const id = ulid();
    const now = new Date().toISOString();
    await this.db.insert(iterationOverridesTable).values({
      id,
      projectId: input.projectId,
      iterationNumber: input.iterationNumber,
      sprintUtilizationPercent: input.sprintUtilizationPercent,
      iterationStartDate: referenceDateRange.startDate,
      iterationEndDate: referenceDateRange.endDate,
      createdAt: now,
      updatedAt: now,
    });

    const created = await this.db
      .select()
      .from(iterationOverridesTable)
      .where(eq(iterationOverridesTable.id, id))
      .get();
    if (!created) {
      return err(ITERATION_REPOSITORY_ERROR);
    }
    return ok(toIterationOverride(created));
  }

  async deleteUtilizationOverride(input: {
    projectId: string;
    iterationNumber: number;
  }): Promise<Result<boolean, IterationRepositoryError>> {
    const deleted = await this.db
      .delete(iterationOverridesTable)
      .where(
        and(
          eq(iterationOverridesTable.projectId, input.projectId),
          eq(iterationOverridesTable.iterationNumber, input.iterationNumber),
        ),
      )
      .returning({ id: iterationOverridesTable.id });
    return ok(deleted.length > 0);
  }

  async listOverrides(
    projectId: string,
  ): Promise<Result<IterationOverride[], IterationRepositoryError>> {
    const rows = await this.db
      .select()
      .from(iterationOverridesTable)
      .where(eq(iterationOverridesTable.projectId, projectId))
      .orderBy(asc(iterationOverridesTable.iterationNumber))
      .all();
    return ok(rows.map((row) => toIterationOverride(row)));
  }

  private async resolveOverrideDateRange(
    input: UpdateIterationUtilizationInput,
  ): Promise<{
    startDate: string | null;
    endDate: string | null;
  }> {
    const iteration = await this.db
      .select({
        startDate: iterationsTable.startDate,
        endDate: iterationsTable.endDate,
      })
      .from(iterationsTable)
      .where(
        and(
          eq(iterationsTable.projectId, input.projectId),
          eq(iterationsTable.iterationNumber, input.iterationNumber),
        ),
      )
      .get();

    if (iteration) {
      return {
        startDate: iteration.startDate,
        endDate: iteration.endDate,
      };
    }

    return {
      startDate: input.iterationStartDate ?? null,
      endDate: input.iterationEndDate ?? null,
    };
  }
}
