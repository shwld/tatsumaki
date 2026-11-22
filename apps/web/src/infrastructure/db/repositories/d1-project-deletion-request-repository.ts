import { asc, eq, sql } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import {
  PROJECT_DELETION_REQUEST_REPOSITORY_ERROR,
  type ProjectDeletionRequest,
  type ProjectDeletionRequestRepository,
  type ProjectDeletionRequestRepositoryError,
} from "../../../domain/repositories/project-deletion-request-repository";
import { createDb, type DbClient } from "../client";
import { projectDeletionRequestsTable } from "../schema";

type Row = typeof projectDeletionRequestsTable.$inferSelect;

const toRequest = (row: Row): ProjectDeletionRequest => ({
  projectId: row.projectId,
  requestedByUserId: row.requestedByUserId,
  attemptCount: row.attemptCount,
});

export class D1ProjectDeletionRequestRepository
  implements ProjectDeletionRequestRepository
{
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async open(input: {
    projectId: string;
    requestedByUserId: string;
  }): Promise<Result<void, ProjectDeletionRequestRepositoryError>> {
    try {
      await this.db
        .insert(projectDeletionRequestsTable)
        .values(input)
        .onConflictDoNothing();
      return ok(undefined);
    } catch {
      return err(PROJECT_DELETION_REQUEST_REPOSITORY_ERROR);
    }
  }

  async findById(
    projectId: string,
  ): Promise<
    Result<ProjectDeletionRequest | null, ProjectDeletionRequestRepositoryError>
  > {
    try {
      const row = await this.db
        .select()
        .from(projectDeletionRequestsTable)
        .where(eq(projectDeletionRequestsTable.projectId, projectId))
        .get();
      return ok(row ? toRequest(row) : null);
    } catch {
      return err(PROJECT_DELETION_REQUEST_REPOSITORY_ERROR);
    }
  }

  async listPending(
    limit: number,
  ): Promise<
    Result<ProjectDeletionRequest[], ProjectDeletionRequestRepositoryError>
  > {
    try {
      const rows = await this.db
        .select()
        .from(projectDeletionRequestsTable)
        .orderBy(asc(projectDeletionRequestsTable.createdAt))
        .limit(limit)
        .all();
      return ok(rows.map(toRequest));
    } catch {
      return err(PROJECT_DELETION_REQUEST_REPOSITORY_ERROR);
    }
  }

  async recordFailure(
    projectId: string,
    error: string,
  ): Promise<Result<void, ProjectDeletionRequestRepositoryError>> {
    try {
      await this.db
        .update(projectDeletionRequestsTable)
        .set({
          attemptCount: sql`${projectDeletionRequestsTable.attemptCount} + 1`,
          lastError: error,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(projectDeletionRequestsTable.projectId, projectId));
      return ok(undefined);
    } catch {
      return err(PROJECT_DELETION_REQUEST_REPOSITORY_ERROR);
    }
  }

  async complete(
    projectId: string,
  ): Promise<Result<void, ProjectDeletionRequestRepositoryError>> {
    try {
      await this.db
        .delete(projectDeletionRequestsTable)
        .where(eq(projectDeletionRequestsTable.projectId, projectId));
      return ok(undefined);
    } catch {
      return err(PROJECT_DELETION_REQUEST_REPOSITORY_ERROR);
    }
  }
}
