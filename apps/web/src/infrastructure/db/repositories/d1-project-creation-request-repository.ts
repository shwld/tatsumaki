import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import type { Project } from "../../../domain/entities/project";
import type {
  ProjectCreationRequest,
  ProjectCreationRequestStatus,
  ProjectCreationStalledReason,
} from "../../../domain/entities/project-creation-request";
import {
  PROJECT_CREATION_REQUEST_REPOSITORY_ERROR,
  type OpenProjectCreationRequestInput,
  type ProjectCreationRequestRepository,
  type ProjectCreationRequestRepositoryError,
  type RecordCreationAttemptInput,
} from "../../../domain/repositories/project-creation-request-repository";
import { createDb, type DbClient } from "../client";
import { projectCreationRequestsTable } from "../schema";
import { D1ProjectRepository } from "./d1-project-repository";

// 完了済みの要求で再作成しない(作成後に削除されたプロジェクトを古い呼び出しが復活させないため)。
const PENDING_REQUEST = `SELECT 1 FROM project_creation_requests WHERE project_id = ? AND status = 'pending' AND stalled_reason IS NULL`;

type Row = typeof projectCreationRequestsTable.$inferSelect;

const toRequest = (row: Row): ProjectCreationRequest => ({
  projectId: row.projectId,
  purchaserUserId: row.purchaserUserId,
  name: row.name,
  idempotencyKey: row.idempotencyKey,
  checkoutRequestId: row.checkoutRequestId,
  status: row.status as ProjectCreationRequestStatus,
  attemptCount: row.attemptCount,
  materializeFailureCount: row.materializeFailureCount,
  stalledReason: row.stalledReason as ProjectCreationStalledReason | null,
  createdAt: row.createdAt,
});

export class D1ProjectCreationRequestRepository
  implements ProjectCreationRequestRepository
{
  private readonly db: DbClient;

  constructor(private readonly d1: D1Database) {
    this.db = createDb(d1);
  }

  async markFailed(projectId: string, now: string) {
    try {
      const result = await this.d1
        .prepare(`UPDATE project_creation_requests
        SET stalled_reason = 'abandoned', outcome_notified = 0, outcome_at = ?, updated_at = ?
        WHERE project_id = ? AND status = 'pending' AND stalled_reason IS NULL`)
        .bind(now, now, projectId)
        .run();
      return ok((result.meta.changes ?? 0) > 0);
    } catch {
      return err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR);
    }
  }

  async listUnnotified(limit: number) {
    try {
      const result = await this.d1
        .prepare(`SELECT project_id, purchaser_user_id, status, outcome_at
        FROM project_creation_requests WHERE outcome_notified = 0 AND outcome_at IS NOT NULL
        ORDER BY updated_at, project_id LIMIT ?`)
        .bind(limit)
        .all<{
          project_id: string;
          purchaser_user_id: string;
          status: string;
          outcome_at: string;
        }>();
      return ok(
        result.results.map((row) => ({
          projectId: row.project_id,
          accountId: row.purchaser_user_id,
          outcome:
            row.status === "created"
              ? ("created" as const)
              : ("failed" as const),
          occurredAt: row.outcome_at.includes("T")
            ? new Date(row.outcome_at).toISOString()
            : new Date(`${row.outcome_at.replace(" ", "T")}Z`).toISOString(),
        })),
      );
    } catch {
      return err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR);
    }
  }

  async markNotificationAttempt(projectId: string) {
    try {
      await this.d1
        .prepare(
          "UPDATE project_creation_requests SET updated_at = ? WHERE project_id = ? AND outcome_notified = 0",
        )
        .bind(new Date().toISOString(), projectId)
        .run();
      return ok(undefined);
    } catch {
      return err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR);
    }
  }

  async markNotified(projectId: string) {
    try {
      await this.d1
        .prepare(
          "UPDATE project_creation_requests SET outcome_notified = 1 WHERE project_id = ?",
        )
        .bind(projectId)
        .run();
      return ok(undefined);
    } catch {
      return err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR);
    }
  }

  async open(
    input: OpenProjectCreationRequestInput,
  ): Promise<
    Result<ProjectCreationRequest, ProjectCreationRequestRepositoryError>
  > {
    try {
      await this.db
        .insert(projectCreationRequestsTable)
        .values(input)
        .onConflictDoNothing();
      const row = await this.db
        .select()
        .from(projectCreationRequestsTable)
        .where(
          and(
            eq(
              projectCreationRequestsTable.purchaserUserId,
              input.purchaserUserId,
            ),
            eq(
              projectCreationRequestsTable.idempotencyKey,
              input.idempotencyKey,
            ),
          ),
        )
        .get();
      return row
        ? ok(toRequest(row))
        : err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR);
    } catch {
      return err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR);
    }
  }

  async findById(
    projectId: string,
  ): Promise<
    Result<ProjectCreationRequest | null, ProjectCreationRequestRepositoryError>
  > {
    try {
      const row = await this.db
        .select()
        .from(projectCreationRequestsTable)
        .where(eq(projectCreationRequestsTable.projectId, projectId))
        .get();
      return ok(row ? toRequest(row) : null);
    } catch {
      return err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR);
    }
  }

  async materialize(
    request: ProjectCreationRequest,
  ): Promise<Result<Project, ProjectCreationRequestRepositoryError>> {
    try {
      await this.d1.batch([
        this.d1
          .prepare(
            `INSERT INTO projects (id, name, sprint_duration_days)
             SELECT ?, ?, 14
             WHERE EXISTS (${PENDING_REQUEST})
             ON CONFLICT(id) DO NOTHING`,
          )
          .bind(request.projectId, request.name, request.projectId),
        this.d1
          .prepare(
            `INSERT INTO project_members (project_id, user_id, role)
             SELECT ?, ?, 'owner'
             WHERE EXISTS (${PENDING_REQUEST})
             ON CONFLICT(project_id, user_id) DO NOTHING`,
          )
          .bind(request.projectId, request.purchaserUserId, request.projectId),
        this.d1
          .prepare(
            `UPDATE project_creation_requests
             SET status = 'created', outcome_notified = 0, outcome_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE project_id = ? AND status = 'pending' AND stalled_reason IS NULL`,
          )
          .bind(request.projectId),
      ]);
      const project = await new D1ProjectRepository(this.d1).findById(
        request.projectId,
      );
      if (project.isErr() || !project.value) {
        return err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR);
      }
      return ok({ ...project.value, currentUserRole: "owner" });
    } catch {
      return err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR);
    }
  }

  async listRecoverable(
    now: string,
    limit: number,
  ): Promise<
    Result<ProjectCreationRequest[], ProjectCreationRequestRepositoryError>
  > {
    try {
      const rows = await this.db
        .select()
        .from(projectCreationRequestsTable)
        .where(
          and(
            eq(projectCreationRequestsTable.status, "pending"),
            isNull(projectCreationRequestsTable.stalledReason),
            or(
              isNull(projectCreationRequestsTable.nextAttemptAt),
              lte(projectCreationRequestsTable.nextAttemptAt, now),
            ),
          ),
        )
        .orderBy(asc(projectCreationRequestsTable.createdAt))
        .limit(limit)
        .all();
      return ok(rows.map(toRequest));
    } catch {
      return err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR);
    }
  }

  async recordAttempt(
    input: RecordCreationAttemptInput,
  ): Promise<Result<void, ProjectCreationRequestRepositoryError>> {
    try {
      await this.db
        .update(projectCreationRequestsTable)
        .set({
          attemptCount: input.attemptCount,
          materializeFailureCount: input.materializeFailureCount,
          nextAttemptAt: input.nextAttemptAt,
          lastError: input.lastError,
          stalledReason: input.stalledReason,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(projectCreationRequestsTable.projectId, input.projectId),
            eq(projectCreationRequestsTable.status, "pending"),
            isNull(projectCreationRequestsTable.stalledReason),
          ),
        );
      return ok(undefined);
    } catch {
      return err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR);
    }
  }
}
