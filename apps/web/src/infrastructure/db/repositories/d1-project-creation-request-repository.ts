import { and, eq } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import type { Project } from "../../../domain/entities/project";
import type {
  ProjectCreationRequest,
  ProjectCreationRequestStatus,
} from "../../../domain/entities/project-creation-request";
import {
  PROJECT_CREATION_REQUEST_REPOSITORY_ERROR,
  type OpenProjectCreationRequestInput,
  type ProjectCreationRequestRepository,
  type ProjectCreationRequestRepositoryError,
} from "../../../domain/repositories/project-creation-request-repository";
import { createDb, type DbClient } from "../client";
import { projectCreationRequestsTable } from "../schema";
import { D1ProjectRepository } from "./d1-project-repository";

type Row = typeof projectCreationRequestsTable.$inferSelect;

const toRequest = (row: Row): ProjectCreationRequest => ({
  projectId: row.projectId,
  purchaserUserId: row.purchaserUserId,
  name: row.name,
  idempotencyKey: row.idempotencyKey,
  checkoutRequestId: row.checkoutRequestId,
  status: row.status as ProjectCreationRequestStatus,
});

export class D1ProjectCreationRequestRepository
  implements ProjectCreationRequestRepository
{
  private readonly db: DbClient;

  constructor(private readonly d1: D1Database) {
    this.db = createDb(d1);
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
             VALUES (?, ?, 14) ON CONFLICT(id) DO NOTHING`,
          )
          .bind(request.projectId, request.name),
        this.d1
          .prepare(
            `INSERT INTO project_members (project_id, user_id, role)
             VALUES (?, ?, 'owner') ON CONFLICT(project_id, user_id) DO NOTHING`,
          )
          .bind(request.projectId, request.purchaserUserId),
        this.d1
          .prepare(
            `UPDATE project_creation_requests
             SET status = 'created', updated_at = CURRENT_TIMESTAMP
             WHERE project_id = ?`,
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
}
