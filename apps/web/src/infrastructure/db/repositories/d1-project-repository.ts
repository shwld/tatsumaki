import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import {
  type IterationStartDay,
  type PointScaleType,
  type Project,
  type SprintDuration,
  isValidIterationStartDay,
  isValidPointScaleType,
  isValidSprintDuration,
} from "../../../domain/entities/project";
import {
  PROJECT_INVITATION_STATUSES,
  PROJECT_MEMBER_ROLES,
  type ProjectInvitation,
  type ProjectInvitationStatus,
  type ProjectMember,
  type ProjectMemberRole,
} from "../../../domain/entities/project-member";
import type {
  CreateProjectInput,
  CreateProjectInvitationInput,
  UpdateProjectSettingsInput,
  ProjectRepository,
  ProjectRepositoryError,
} from "../../../domain/repositories/project-repository";
import { PROJECT_REPOSITORY_ERROR } from "../../../domain/repositories/project-repository";
import { createDb, type DbClient } from "../client";
import {
  projectInvitationsTable,
  projectMembersTable,
  projectsTable,
} from "../schema";

type ProjectRow = typeof projectsTable.$inferSelect;
type ProjectMemberRow = typeof projectMembersTable.$inferSelect;
type ProjectInvitationRow = typeof projectInvitationsTable.$inferSelect;

function isProjectMemberRole(value: string): value is ProjectMemberRole {
  return PROJECT_MEMBER_ROLES.includes(value as ProjectMemberRole);
}

function isProjectInvitationStatus(
  value: string,
): value is ProjectInvitationStatus {
  return PROJECT_INVITATION_STATUSES.includes(value as ProjectInvitationStatus);
}

function parseCustomPointScale(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) {
      return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function toProject(
  row: ProjectRow,
  currentUserRole?: ProjectMemberRole,
): Project {
  const pointScaleType: PointScaleType = isValidPointScaleType(
    row.pointScaleType,
  )
    ? row.pointScaleType
    : "fibonacci";

  return {
    __typename: "Project",
    id: row.id,
    name: row.name,
    description: row.description,
    isPublic: row.isPublic === 1,
    timezone: row.timezone,
    sprintDurationDays: isValidSprintDuration(row.sprintDurationDays)
      ? row.sprintDurationDays
      : (14 as SprintDuration),
    pointScaleType,
    customPointScale: parseCustomPointScale(row.customPointScale),
    estimateBugs: row.estimateBugs === 1,
    estimateChores: row.estimateChores === 1,
    iterationStartDay: isValidIterationStartDay(row.iterationStartDay)
      ? row.iterationStartDay
      : (1 as IterationStartDay),
    ...(currentUserRole ? { currentUserRole } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toProjectMember(row: ProjectMemberRow): ProjectMember {
  return {
    __typename: "ProjectMember",
    projectId: row.projectId,
    userId: row.userId,
    role: isProjectMemberRole(row.role) ? row.role : "viewer",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toProjectInvitation(row: ProjectInvitationRow): ProjectInvitation {
  return {
    __typename: "ProjectInvitation",
    id: row.id,
    projectId: row.projectId,
    inviterUserId: row.inviterUserId,
    targetUserId: row.targetUserId,
    targetEmail: row.targetEmail,
    role: isProjectMemberRole(row.role) ? row.role : "viewer",
    status: isProjectInvitationStatus(row.status) ? row.status : "pending",
    expiresAt: row.expiresAt,
    acceptedByUserId: row.acceptedByUserId,
    acceptedAt: row.acceptedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class D1ProjectRepository implements ProjectRepository {
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async listSoleOwnerProjectIds(
    userId: string,
  ): Promise<Result<string[], ProjectRepositoryError>> {
    const projects = await this.listSoleOwnerProjects(userId);
    if (projects.isErr()) return err(projects.error);
    return ok(projects.value.map((p) => p.id));
  }

  async listSoleOwnerProjects(
    userId: string,
  ): Promise<Result<{ id: string; name: string }[], ProjectRepositoryError>> {
    const pm = projectMembersTable;
    const pm2Alias = sql`project_members pm2`;

    const rows = await this.db
      .select({ projectId: pm.projectId, projectName: projectsTable.name })
      .from(pm)
      .innerJoin(projectsTable, eq(projectsTable.id, pm.projectId))
      .where(
        and(
          eq(pm.userId, userId),
          eq(pm.role, "owner"),
          sql`NOT EXISTS (
            SELECT 1 FROM ${pm2Alias}
            WHERE pm2.project_id = ${pm.projectId}
              AND pm2.role = 'owner'
              AND pm2.user_id != ${userId}
          )`,
        ),
      )
      .all();

    return ok(rows.map((r) => ({ id: r.projectId, name: r.projectName })));
  }

  async create(
    input: CreateProjectInput,
  ): Promise<Result<Project, ProjectRepositoryError>> {
    const projectId = ulid();

    const [inserted] = await this.db
      .insert(projectsTable)
      .values({
        id: projectId,
        name: input.name,
        sprintDurationDays: 14,
      })
      .returning({ id: projectsTable.id });

    if (!inserted) {
      return err(PROJECT_REPOSITORY_ERROR);
    }

    await this.db.insert(projectMembersTable).values({
      projectId,
      userId: input.ownerUserId,
      role: "owner",
    });

    const created = await this.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, inserted.id))
      .get();

    if (!created) {
      return err(PROJECT_REPOSITORY_ERROR);
    }

    return ok(toProject(created, "owner"));
  }

  async listAll(): Promise<Result<Project[], ProjectRepositoryError>> {
    const rows = await this.db
      .select()
      .from(projectsTable)
      .orderBy(projectsTable.createdAt)
      .all();

    return ok(rows.map((row) => toProject(row)));
  }

  async listByMember(
    userId: string,
  ): Promise<Result<Project[], ProjectRepositoryError>> {
    const rows = await this.db
      .select({
        id: projectsTable.id,
        name: projectsTable.name,
        description: projectsTable.description,
        isPublic: projectsTable.isPublic,
        timezone: projectsTable.timezone,
        sprintDurationDays: projectsTable.sprintDurationDays,
        pointScaleType: projectsTable.pointScaleType,
        customPointScale: projectsTable.customPointScale,
        estimateBugs: projectsTable.estimateBugs,
        estimateChores: projectsTable.estimateChores,
        iterationStartDay: projectsTable.iterationStartDay,
        createdAt: projectsTable.createdAt,
        updatedAt: projectsTable.updatedAt,
        currentUserRole: projectMembersTable.role,
      })
      .from(projectsTable)
      .innerJoin(
        projectMembersTable,
        eq(projectsTable.id, projectMembersTable.projectId),
      )
      .where(eq(projectMembersTable.userId, userId))
      .orderBy(asc(projectsTable.id))
      .all();

    return ok(
      rows.map((row) => {
        const role = isProjectMemberRole(row.currentUserRole)
          ? row.currentUserRole
          : "viewer";

        return toProject(
          {
            id: row.id,
            name: row.name,
            description: row.description,
            isPublic: row.isPublic,
            timezone: row.timezone,
            sprintDurationDays: row.sprintDurationDays,
            pointScaleType: row.pointScaleType,
            customPointScale: row.customPointScale,
            estimateBugs: row.estimateBugs,
            estimateChores: row.estimateChores,
            iterationStartDay: row.iterationStartDay,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          },
          role,
        );
      }),
    );
  }

  async findMember(
    projectId: string,
    userId: string,
  ): Promise<Result<ProjectMember | null, ProjectRepositoryError>> {
    const row = await this.db
      .select()
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, projectId),
          eq(projectMembersTable.userId, userId),
        ),
      )
      .get();

    if (!row) {
      return ok(null);
    }

    return ok(toProjectMember(row));
  }

  async listMembers(
    projectId: string,
  ): Promise<Result<ProjectMember[], ProjectRepositoryError>> {
    const rows = await this.db
      .select()
      .from(projectMembersTable)
      .where(eq(projectMembersTable.projectId, projectId))
      .orderBy(
        asc(projectMembersTable.createdAt),
        asc(projectMembersTable.userId),
      )
      .all();

    return ok(rows.map(toProjectMember));
  }

  async listInvitations(
    projectId: string,
  ): Promise<Result<ProjectInvitation[], ProjectRepositoryError>> {
    const rows = await this.db
      .select()
      .from(projectInvitationsTable)
      .where(eq(projectInvitationsTable.projectId, projectId))
      .orderBy(
        asc(projectInvitationsTable.createdAt),
        asc(projectInvitationsTable.id),
      )
      .all();

    return ok(rows.map(toProjectInvitation));
  }

  async findInvitation(
    projectId: string,
    invitationId: string,
  ): Promise<Result<ProjectInvitation | null, ProjectRepositoryError>> {
    const row = await this.db
      .select()
      .from(projectInvitationsTable)
      .where(
        and(
          eq(projectInvitationsTable.projectId, projectId),
          eq(projectInvitationsTable.id, invitationId),
        ),
      )
      .get();

    if (!row) {
      return ok(null);
    }

    return ok(toProjectInvitation(row));
  }

  async findPendingInvitationByTarget(input: {
    projectId: string;
    targetUserId: string | null;
    targetEmail: string | null;
  }): Promise<Result<ProjectInvitation | null, ProjectRepositoryError>> {
    if (!input.targetUserId && !input.targetEmail) {
      return ok(null);
    }

    let row: ProjectInvitationRow | undefined;

    if (input.targetUserId) {
      row = await this.db
        .select()
        .from(projectInvitationsTable)
        .where(
          and(
            eq(projectInvitationsTable.projectId, input.projectId),
            eq(projectInvitationsTable.status, "pending"),
            eq(projectInvitationsTable.targetUserId, input.targetUserId),
          ),
        )
        .get();
    } else {
      const targetEmail = input.targetEmail;
      if (!targetEmail) {
        return ok(null);
      }

      row = await this.db
        .select()
        .from(projectInvitationsTable)
        .where(
          and(
            eq(projectInvitationsTable.projectId, input.projectId),
            eq(projectInvitationsTable.status, "pending"),
            eq(projectInvitationsTable.targetEmail, targetEmail),
            isNull(projectInvitationsTable.targetUserId),
          ),
        )
        .get();
    }

    if (!row) {
      return ok(null);
    }

    return ok(toProjectInvitation(row));
  }

  async createInvitation(
    input: CreateProjectInvitationInput,
  ): Promise<Result<ProjectInvitation, ProjectRepositoryError>> {
    const invitationId = ulid();

    const [inserted] = await this.db
      .insert(projectInvitationsTable)
      .values({
        id: invitationId,
        projectId: input.projectId,
        inviterUserId: input.inviterUserId,
        targetUserId: input.targetUserId,
        targetEmail: input.targetEmail,
        role: input.role,
        status: "pending",
        expiresAt: input.expiresAt,
      })
      .returning({ id: projectInvitationsTable.id })
      .onConflictDoNothing();

    if (!inserted) {
      return err(PROJECT_REPOSITORY_ERROR);
    }

    const created = await this.db
      .select()
      .from(projectInvitationsTable)
      .where(eq(projectInvitationsTable.id, inserted.id))
      .get();

    if (!created) {
      return err(PROJECT_REPOSITORY_ERROR);
    }

    return ok(toProjectInvitation(created));
  }

  async acceptInvitation(
    invitationId: string,
    acceptedByUserId: string,
  ): Promise<Result<ProjectInvitation | null, ProjectRepositoryError>> {
    await this.db
      .update(projectInvitationsTable)
      .set({
        status: "accepted",
        acceptedByUserId,
        acceptedAt: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(projectInvitationsTable.id, invitationId));

    const updated = await this.db
      .select()
      .from(projectInvitationsTable)
      .where(eq(projectInvitationsTable.id, invitationId))
      .get();

    if (!updated) {
      return ok(null);
    }

    return ok(toProjectInvitation(updated));
  }

  async upsertMember(input: {
    projectId: string;
    userId: string;
    role: ProjectMemberRole;
  }): Promise<Result<ProjectMember, ProjectRepositoryError>> {
    await this.db
      .insert(projectMembersTable)
      .values({
        projectId: input.projectId,
        userId: input.userId,
        role: input.role,
      })
      .onConflictDoUpdate({
        target: [projectMembersTable.projectId, projectMembersTable.userId],
        set: {
          role: input.role,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });

    const upserted = await this.db
      .select()
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, input.projectId),
          eq(projectMembersTable.userId, input.userId),
        ),
      )
      .get();

    if (!upserted) {
      return err(PROJECT_REPOSITORY_ERROR);
    }

    return ok(toProjectMember(upserted));
  }

  async findById(
    projectId: string,
  ): Promise<Result<Project | null, ProjectRepositoryError>> {
    const row = await this.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .get();

    if (!row) {
      return ok(null);
    }

    return ok(toProject(row));
  }

  async updateSettings(
    input: UpdateProjectSettingsInput,
  ): Promise<Result<Project | null, ProjectRepositoryError>> {
    const setValues: Record<string, unknown> = {
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };
    if (input.name !== undefined) {
      setValues.name = input.name;
    }
    if (input.description !== undefined) {
      setValues.description = input.description;
    }
    if (input.isPublic !== undefined) {
      setValues.isPublic = input.isPublic ? 1 : 0;
    }
    if (input.timezone !== undefined) {
      setValues.timezone = input.timezone;
    }
    if (input.estimateBugs !== undefined) {
      setValues.estimateBugs = input.estimateBugs ? 1 : 0;
    }
    if (input.estimateChores !== undefined) {
      setValues.estimateChores = input.estimateChores ? 1 : 0;
    }
    if (input.sprintDurationDays !== undefined) {
      setValues.sprintDurationDays = input.sprintDurationDays;
    }
    if (input.iterationStartDay !== undefined) {
      setValues.iterationStartDay = input.iterationStartDay;
    }
    await this.db
      .update(projectsTable)
      .set(setValues)
      .where(eq(projectsTable.id, input.projectId));

    const updated = await this.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, input.projectId))
      .get();

    if (!updated) {
      return ok(null);
    }

    return ok(toProject(updated));
  }

  async updateMemberRole(input: {
    projectId: string;
    userId: string;
    role: ProjectMemberRole;
  }): Promise<Result<ProjectMember | null, ProjectRepositoryError>> {
    await this.db
      .update(projectMembersTable)
      .set({
        role: input.role,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(
        and(
          eq(projectMembersTable.projectId, input.projectId),
          eq(projectMembersTable.userId, input.userId),
        ),
      );

    const updated = await this.db
      .select()
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, input.projectId),
          eq(projectMembersTable.userId, input.userId),
        ),
      )
      .get();

    if (!updated) {
      return ok(null);
    }

    return ok(toProjectMember(updated));
  }

  async updatePointScale(input: {
    projectId: string;
    pointScaleType: PointScaleType;
    customPointScale: number[] | null;
  }): Promise<Result<Project | null, ProjectRepositoryError>> {
    await this.db
      .update(projectsTable)
      .set({
        pointScaleType: input.pointScaleType,
        customPointScale: input.customPointScale
          ? JSON.stringify(input.customPointScale)
          : null,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(projectsTable.id, input.projectId));

    const updated = await this.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, input.projectId))
      .get();

    if (!updated) {
      return ok(null);
    }

    return ok(toProject(updated));
  }

  async delete(
    projectId: string,
  ): Promise<Result<boolean, ProjectRepositoryError>> {
    const existing = await this.db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .get();

    if (!existing) {
      return ok(false);
    }

    await this.db.delete(projectsTable).where(eq(projectsTable.id, projectId));
    return ok(true);
  }
}
