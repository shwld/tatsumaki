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

  constructor(private readonly d1: D1Database) {
    this.db = createDb(d1);
  }

  async open(input: {
    projectId: string;
    requestedByUserId: string;
  }): Promise<Result<boolean, ProjectDeletionRequestRepositoryError>> {
    try {
      const inserted = await this.d1
        .prepare(
          `INSERT INTO project_deletion_requests (project_id, requested_by_user_id)
           SELECT ?1, ?2
           WHERE EXISTS (SELECT 1 FROM project_members m
                         WHERE m.project_id = ?1 AND m.user_id = ?2 AND m.role = 'owner')
           ON CONFLICT DO NOTHING`,
        )
        .bind(input.projectId, input.requestedByUserId)
        .run();
      if (inserted.meta.changes > 0) {
        return ok(true);
      }
      // 既存の要求は別の owner のものかもしれないため、行の有無ではなく要求者の現在の権限と要求の保存を 1 文で確認する。
      const owner = await this.d1
        .prepare(
          `SELECT 1 AS ok FROM project_members m
           JOIN project_deletion_requests d ON d.project_id = m.project_id
           WHERE m.project_id = ?1 AND m.user_id = ?2 AND m.role = 'owner'`,
        )
        .bind(input.projectId, input.requestedByUserId)
        .first();
      return ok(owner !== null);
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
        // 失敗すると updatedAt が進むため、失敗中の要求が後続を飢えさせない。
        .orderBy(asc(projectDeletionRequestsTable.updatedAt))
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
          updatedAt: sql`CURRENT_TIMESTAMP`,
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
