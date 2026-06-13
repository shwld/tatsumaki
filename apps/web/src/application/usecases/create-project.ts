import { err, ok, type Result } from "neverthrow";
import type { Project } from "../../domain/entities/project";
import type {
  ProjectRepository,
  ProjectRepositoryError,
} from "../../domain/repositories/project-repository";

export const INVALID_PROJECT_NAME_ERROR = "INVALID_PROJECT_NAME_ERROR" as const;

export type CreateProjectError =
  | typeof INVALID_PROJECT_NAME_ERROR
  | ProjectRepositoryError;

export async function createProject(
  repository: ProjectRepository,
  input: { name: string; ownerUserId: string },
): Promise<Result<Project, CreateProjectError>> {
  const normalizedName = input.name.trim();

  if (!normalizedName) {
    return err(INVALID_PROJECT_NAME_ERROR);
  }

  const projectResult = await repository.create({
    name: normalizedName,
    ownerUserId: input.ownerUserId,
  });

  if (projectResult.isErr()) {
    return err(projectResult.error);
  }

  return ok(projectResult.value);
}
