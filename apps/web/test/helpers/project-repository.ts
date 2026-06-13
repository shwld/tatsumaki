import { err, ok, type Result } from "neverthrow";
import type { Project } from "../../src/domain/entities/project";
import type {
  ProjectInvitation,
  ProjectMember,
} from "../../src/domain/entities/project-member";
import {
  PROJECT_REPOSITORY_ERROR,
  type ProjectRepository,
  type ProjectRepositoryError,
} from "../../src/domain/repositories/project-repository";

type RepositoryMockOptions = {
  createResult?: Result<Project, ProjectRepositoryError>;
  listResult?: Result<Project[], ProjectRepositoryError>;
};

export function buildProject(overrides?: Partial<Project>): Project {
  return {
    __typename: "Project",
    id: "01JNMVQ8Q9Y6P5KH1XZ4V7C2TM",
    name: "Alpha Project",
    description: "",
    isPublic: false,
    timezone: "Asia/Tokyo",
    sprintDurationDays: 14,
    pointScaleType: "fibonacci",
    customPointScale: null,
    estimateBugs: true,
    estimateChores: true,
    iterationStartDay: 1,
    createdAt: "2026-03-06 00:00:00",
    updatedAt: "2026-03-06 00:00:00",
    ...overrides,
  };
}

function buildProjectMember(overrides?: Partial<ProjectMember>): ProjectMember {
  return {
    __typename: "ProjectMember",
    projectId: "01JNMVQ8Q9Y6P5KH1XZ4V7C2TM",
    userId: "github|test-user",
    role: "owner",
    createdAt: "2026-03-06 00:00:00",
    updatedAt: "2026-03-06 00:00:00",
    ...overrides,
  };
}

function buildProjectInvitation(
  overrides?: Partial<ProjectInvitation>,
): ProjectInvitation {
  return {
    __typename: "ProjectInvitation",
    id: "01JNMVQ8Q9Y6P5KH1XZ4V7C2TM",
    projectId: "01JNMVQ8Q9Y6P5KH1XZ4V7C2TM",
    inviterUserId: "github|test-user",
    targetUserId: "github|invited-user",
    targetEmail: null,
    role: "member",
    status: "pending",
    expiresAt: "2026-03-20T00:00:00.000Z",
    acceptedByUserId: null,
    acceptedAt: null,
    createdAt: "2026-03-06 00:00:00",
    updatedAt: "2026-03-06 00:00:00",
    ...overrides,
  };
}

export function createProjectRepositoryMock(
  options?: RepositoryMockOptions,
): ProjectRepository {
  return {
    listSoleOwnerProjectIds: async () => ok([]),
    listSoleOwnerProjects: async () => ok([]),
    listAll: async () => ok([]),
    create: async ({ name }) => {
      if (options?.createResult) {
        return options.createResult;
      }

      return ok(buildProject({ name }));
    },
    listByMember: async () => {
      if (options?.listResult) {
        return options.listResult;
      }

      return ok([buildProject()]);
    },
    findMember: async () => ok(buildProjectMember()),
    listMembers: async () => ok([buildProjectMember()]),
    listInvitations: async () => ok([buildProjectInvitation()]),
    findInvitation: async () => ok(buildProjectInvitation()),
    findPendingInvitationByTarget: async () => ok(null),
    createInvitation: async () => ok(buildProjectInvitation()),
    acceptInvitation: async () =>
      ok(buildProjectInvitation({ status: "accepted" })),
    upsertMember: async () => ok(buildProjectMember()),
    updateMemberRole: async ({ role }) => ok(buildProjectMember({ role })),
    findById: async () => ok(buildProject()),
    updateSettings: async () => ok(buildProject()),
    updatePointScale: async ({ pointScaleType, customPointScale }) =>
      ok(buildProject({ pointScaleType, customPointScale })),
    delete: async () => ok(true),
  };
}

export function repositoryErrorResult() {
  return err<Project, ProjectRepositoryError>(PROJECT_REPOSITORY_ERROR);
}
