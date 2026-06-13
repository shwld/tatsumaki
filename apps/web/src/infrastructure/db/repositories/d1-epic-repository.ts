import { and, asc, eq, sql } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type { Epic } from "../../../domain/entities/epic";
import type {
  CreateEpicInput,
  EpicRepository,
  EpicRepositoryError,
  UpdateEpicInput,
} from "../../../domain/repositories/epic-repository";
import {
  EPIC_DUPLICATE_NAME_ERROR,
  EPIC_REPOSITORY_ERROR,
} from "../../../domain/repositories/epic-repository";
import { createDb, type DbClient } from "../client";
import { epicsTable } from "../schema/epics";
import { storiesTable } from "../schema/stories";

type EpicRow = typeof epicsTable.$inferSelect;

function toEpic(row: EpicRow, completed: number, total: number): Epic {
  return {
    __typename: "Epic",
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    progress: {
      completed,
      remaining: Math.max(0, total - completed),
      total,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class D1EpicRepository implements EpicRepository {
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async create(
    input: CreateEpicInput,
  ): Promise<Result<Epic, EpicRepositoryError>> {
    const duplicate = await this.db
      .select({ id: epicsTable.id })
      .from(epicsTable)
      .where(
        and(
          eq(epicsTable.projectId, input.projectId),
          eq(epicsTable.name, input.name),
        ),
      )
      .get();

    if (duplicate) {
      return err(EPIC_DUPLICATE_NAME_ERROR);
    }

    const now = new Date().toISOString();
    const id = ulid();

    await this.db.insert(epicsTable).values({
      id,
      projectId: input.projectId,
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    });

    const created = await this.db
      .select()
      .from(epicsTable)
      .where(eq(epicsTable.id, id))
      .get();
    if (!created) {
      return err(EPIC_REPOSITORY_ERROR);
    }

    return ok(toEpic(created, 0, 0));
  }

  async update(
    input: UpdateEpicInput,
  ): Promise<Result<Epic | null, EpicRepositoryError>> {
    const existing = await this.db
      .select()
      .from(epicsTable)
      .where(
        and(
          eq(epicsTable.projectId, input.projectId),
          eq(epicsTable.id, input.id),
        ),
      )
      .get();

    if (!existing) {
      return ok(null);
    }

    if (input.name !== undefined && input.name !== existing.name) {
      const duplicate = await this.db
        .select({ id: epicsTable.id })
        .from(epicsTable)
        .where(
          and(
            eq(epicsTable.projectId, input.projectId),
            eq(epicsTable.name, input.name),
          ),
        )
        .get();
      if (duplicate) {
        return err(EPIC_DUPLICATE_NAME_ERROR);
      }
    }

    await this.db
      .update(epicsTable)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(
        and(
          eq(epicsTable.projectId, input.projectId),
          eq(epicsTable.id, input.id),
        ),
      );

    const [row] = await this.db
      .select({
        epic: epicsTable,
        completed: sql<number>`count(case when ${storiesTable.status} = 'Accepted' then 1 end)`,
        total: sql<number>`count(${storiesTable.id})`,
      })
      .from(epicsTable)
      .leftJoin(storiesTable, eq(storiesTable.epicId, epicsTable.id))
      .where(
        and(
          eq(epicsTable.projectId, input.projectId),
          eq(epicsTable.id, input.id),
        ),
      )
      .groupBy(epicsTable.id)
      .all();

    if (!row) {
      return err(EPIC_REPOSITORY_ERROR);
    }

    return ok(toEpic(row.epic, row.completed ?? 0, row.total ?? 0));
  }

  async delete(
    projectId: string,
    id: string,
  ): Promise<Result<boolean, EpicRepositoryError>> {
    const removed = await this.db
      .delete(epicsTable)
      .where(and(eq(epicsTable.projectId, projectId), eq(epicsTable.id, id)))
      .returning({ id: epicsTable.id });

    return ok(removed.length > 0);
  }

  async list(projectId: string): Promise<Result<Epic[], EpicRepositoryError>> {
    const rows = await this.db
      .select({
        epic: epicsTable,
        completed: sql<number>`count(case when ${storiesTable.status} = 'Accepted' then 1 end)`,
        total: sql<number>`count(${storiesTable.id})`,
      })
      .from(epicsTable)
      .leftJoin(storiesTable, eq(storiesTable.epicId, epicsTable.id))
      .where(eq(epicsTable.projectId, projectId))
      .groupBy(epicsTable.id)
      .orderBy(asc(epicsTable.name))
      .all();

    return ok(
      rows.map((row) => {
        return toEpic(row.epic, row.completed ?? 0, row.total ?? 0);
      }),
    );
  }

  async exists(
    projectId: string,
    id: string,
  ): Promise<Result<boolean, EpicRepositoryError>> {
    const row = await this.db
      .select({ id: epicsTable.id })
      .from(epicsTable)
      .where(and(eq(epicsTable.projectId, projectId), eq(epicsTable.id, id)))
      .get();

    return ok(Boolean(row));
  }
}
