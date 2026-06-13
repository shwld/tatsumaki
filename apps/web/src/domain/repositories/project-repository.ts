import type { Result } from "neverthrow";
import type {
  IterationStartDay,
  PointScaleType,
  Project,
  SprintDuration,
} from "../entities/project";
import type {
  ProjectInvitation,
  ProjectMember,
  ProjectMemberRole,
} from "../entities/project-member";

export type CreateProjectInput = {
  name: string;
  ownerUserId: string;
};

export type UpdateProjectSettingsInput = {
  projectId: string;
  name?: string;
  description?: string;
  isPublic?: boolean;
  timezone?: string;
  estimateBugs?: boolean;
  estimateChores?: boolean;
  sprintDurationDays?: SprintDuration;
  iterationStartDay?: IterationStartDay;
};

export type CreateProjectInvitationInput = {
  projectId: string;
  inviterUserId: string;
  targetUserId: string | null;
  targetEmail: string | null;
  role: ProjectMemberRole;
  expiresAt: string;
};

export const PROJECT_REPOSITORY_ERROR = "PROJECT_REPOSITORY_ERROR" as const;

export type ProjectRepositoryError = typeof PROJECT_REPOSITORY_ERROR;

export interface ProjectRepository {
  listSoleOwnerProjectIds(
    userId: string,
  ): Promise<Result<string[], ProjectRepositoryError>>;
  listSoleOwnerProjects(
    userId: string,
  ): Promise<Result<{ id: string; name: string }[], ProjectRepositoryError>>;
  create(
    input: CreateProjectInput,
  ): Promise<Result<Project, ProjectRepositoryError>>;
  listAll(): Promise<Result<Project[], ProjectRepositoryError>>;
  listByMember(
    userId: string,
  ): Promise<Result<Project[], ProjectRepositoryError>>;
  findMember(
    projectId: string,
    userId: string,
  ): Promise<Result<ProjectMember | null, ProjectRepositoryError>>;
  listMembers(
    projectId: string,
  ): Promise<Result<ProjectMember[], ProjectRepositoryError>>;
  listInvitations(
    projectId: string,
  ): Promise<Result<ProjectInvitation[], ProjectRepositoryError>>;
  findInvitation(
    projectId: string,
    invitationId: string,
  ): Promise<Result<ProjectInvitation | null, ProjectRepositoryError>>;
  findPendingInvitationByTarget(input: {
    projectId: string;
    targetUserId: string | null;
    targetEmail: string | null;
  }): Promise<Result<ProjectInvitation | null, ProjectRepositoryError>>;
  createInvitation(
    input: CreateProjectInvitationInput,
  ): Promise<Result<ProjectInvitation, ProjectRepositoryError>>;
  acceptInvitation(
    invitationId: string,
    acceptedByUserId: string,
  ): Promise<Result<ProjectInvitation | null, ProjectRepositoryError>>;
  upsertMember(input: {
    projectId: string;
    userId: string;
    role: ProjectMemberRole;
  }): Promise<Result<ProjectMember, ProjectRepositoryError>>;
  updateMemberRole(input: {
    projectId: string;
    userId: string;
    role: ProjectMemberRole;
  }): Promise<Result<ProjectMember | null, ProjectRepositoryError>>;
  findById(
    projectId: string,
  ): Promise<Result<Project | null, ProjectRepositoryError>>;
  updateSettings(
    input: UpdateProjectSettingsInput,
  ): Promise<Result<Project | null, ProjectRepositoryError>>;
  updatePointScale(input: {
    projectId: string;
    pointScaleType: PointScaleType;
    customPointScale: number[] | null;
  }): Promise<Result<Project | null, ProjectRepositoryError>>;
  delete(projectId: string): Promise<Result<boolean, ProjectRepositoryError>>;
}
