import { and, eq, or } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type {
  SavedFilter,
  SavedFilterConditions,
} from "../../../domain/entities/saved-filter";
import type {
  CreateSavedFilterInput,
  ListSavedFiltersInput,
  SavedFilterRepository,
  SavedFilterRepositoryError,
} from "../../../domain/repositories/saved-filter-repository";
import {
  SAVED_FILTER_FORBIDDEN_ERROR,
  SAVED_FILTER_NOT_FOUND_ERROR,
  SAVED_FILTER_REPOSITORY_ERROR,
} from "../../../domain/repositories/saved-filter-repository";
import { createDb, type DbClient } from "../client";
import { savedFiltersTable } from "../schema/saved-filters";

type SavedFilterRow = typeof savedFiltersTable.$inferSelect;

function toSavedFilter(row: SavedFilterRow): SavedFilter {
  let filters: SavedFilterConditions = {};
  try {
    filters = JSON.parse(row.filters) as SavedFilterConditions;
  } catch {
    filters = {};
  }
  return {
    __typename: "SavedFilter",
    id: row.id,
    projectId: row.projectId,
    ownerUserId: row.ownerUserId,
    name: row.name,
    filters,
    visibility: row.visibility as SavedFilter["visibility"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class D1SavedFilterRepository implements SavedFilterRepository {
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async create(
    input: CreateSavedFilterInput,
  ): Promise<Result<SavedFilter, SavedFilterRepositoryError>> {
    try {
      const id = ulid();
      const now = new Date().toISOString();
      const filtersJson = JSON.stringify(input.filters);

      await this.db.insert(savedFiltersTable).values({
        id,
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        name: input.name,
        filters: filtersJson,
        visibility: input.visibility ?? "private",
        createdAt: now,
        updatedAt: now,
      });

      const row = await this.db
        .select()
        .from(savedFiltersTable)
        .where(eq(savedFiltersTable.id, id))
        .get();

      if (!row) {
        return err(SAVED_FILTER_REPOSITORY_ERROR);
      }

      return ok(toSavedFilter(row));
    } catch {
      return err(SAVED_FILTER_REPOSITORY_ERROR);
    }
  }

  async list(
    input: ListSavedFiltersInput,
  ): Promise<Result<SavedFilter[], SavedFilterRepositoryError>> {
    try {
      const rows = await this.db
        .select()
        .from(savedFiltersTable)
        .where(
          and(
            eq(savedFiltersTable.projectId, input.projectId),
            or(
              eq(savedFiltersTable.ownerUserId, input.userId),
              eq(savedFiltersTable.visibility, "project"),
            ),
          ),
        )
        .all();

      return ok(rows.map(toSavedFilter));
    } catch {
      return err(SAVED_FILTER_REPOSITORY_ERROR);
    }
  }

  async delete(
    id: string,
    projectId: string,
    userId: string,
  ): Promise<Result<boolean, SavedFilterRepositoryError>> {
    try {
      const row = await this.db
        .select()
        .from(savedFiltersTable)
        .where(
          and(
            eq(savedFiltersTable.id, id),
            eq(savedFiltersTable.projectId, projectId),
          ),
        )
        .get();

      if (!row) {
        return err(SAVED_FILTER_NOT_FOUND_ERROR);
      }

      if (row.ownerUserId !== userId) {
        return err(SAVED_FILTER_FORBIDDEN_ERROR);
      }

      await this.db
        .delete(savedFiltersTable)
        .where(
          and(
            eq(savedFiltersTable.id, id),
            eq(savedFiltersTable.projectId, projectId),
          ),
        );

      return ok(true);
    } catch {
      return err(SAVED_FILTER_REPOSITORY_ERROR);
    }
  }
}
