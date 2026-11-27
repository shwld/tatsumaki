import { err, ok, type Result } from "neverthrow";
import type {
  ProjectNotice,
  ProjectOperationsGateway,
  ProjectOperationsList,
  ProjectOperationsLocale,
} from "../ports/project-operations-gateway";
import type { ProjectAccessState } from "../../domain/entities/project-usage";
import type {
  AccountOperation,
  ProjectOperation,
} from "../../domain/entities/project-operation";
import {
  PROJECT_REPOSITORY_ERROR,
  type ProjectRepository,
} from "../../domain/repositories/project-repository";

export type OwnedProjectUsage = {
  projectId: string;
  projectName: string;
  access: ProjectAccessState;
  operations: ProjectOperation[];
  notice: ProjectNotice | null;
};

export type OwnedProjectUsageList = {
  /** false: the operations could not be read, so none are offered. */
  operationsAvailable: boolean;
  accountOperations: AccountOperation[];
  projects: OwnedProjectUsage[];
};

export async function listOwnedProjectUsage(
  deps: {
    projects: Pick<ProjectRepository, "listByMember">;
    operations: ProjectOperationsGateway;
    accessState: (projectId: string) => Promise<ProjectAccessState>;
  },
  input: {
    userId: string;
    locale: ProjectOperationsLocale;
    checkoutEnabled: boolean;
  },
): Promise<Result<OwnedProjectUsageList, typeof PROJECT_REPOSITORY_ERROR>> {
  const projects = await deps.projects.listByMember(input.userId);
  if (projects.isErr()) {
    return err(PROJECT_REPOSITORY_ERROR);
  }
  const owned = projects.value.filter(
    (project) => project.currentUserRole === "owner",
  );

  let list: ProjectOperationsList | null;
  try {
    list = await deps.operations.listProjectOperations({
      accountId: input.userId,
      projectIds: owned.map((project) => project.id),
      locale: input.locale,
    });
  } catch {
    console.error("Failed to list project operations");
    list = null;
  }

  const byProject = new Map(
    list?.projects.map((entry) => [entry.projectId, entry]),
  );
  const complete =
    list !== null && owned.every((project) => byProject.has(project.id));
  const rows = await Promise.all(
    owned.map(async (project): Promise<OwnedProjectUsage> => {
      const entry = complete ? byProject.get(project.id) : undefined;
      return {
        projectId: project.id,
        projectName: project.name,
        access: await deps.accessState(project.id),
        operations: (entry?.operations ?? []).filter(
          (operation) => operation !== "resume" || input.checkoutEnabled,
        ),
        notice: entry?.notice ?? null,
      };
    }),
  );
  return ok({
    operationsAvailable: complete,
    accountOperations: complete ? (list?.accountOperations ?? []) : [],
    projects: rows,
  });
}
