import { err, ok, type Result } from "neverthrow";
import type {
  ProjectRepository,
  ProjectRepositoryError,
} from "../../domain/repositories/project-repository";

export const PROJECT_NOT_FOUND_ERROR = "PROJECT_NOT_FOUND_ERROR" as const;
export const PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR =
  "PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR" as const;

export type DeleteProjectError =
  | typeof PROJECT_NOT_FOUND_ERROR
  | typeof PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR
  | ProjectRepositoryError;

export async function deleteProject(
  repository: ProjectRepository,
  input: { projectId: string; confirmProjectName: string },
): Promise<Result<true, DeleteProjectError>> {
  const projectResult = await repository.findById(input.projectId);
  if (projectResult.isErr()) {
    return err(projectResult.error);
  }

  const project = projectResult.value;
  if (!project) {
    return err(PROJECT_NOT_FOUND_ERROR);
  }

  if (input.confirmProjectName !== project.name) {
    return err(PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR);
  }

  const deleteResult = await repository.delete(input.projectId);
  if (deleteResult.isErr()) {
    return err(deleteResult.error);
  }
  if (!deleteResult.value) {
    return err(PROJECT_NOT_FOUND_ERROR);
  }
  return ok(true);
}
