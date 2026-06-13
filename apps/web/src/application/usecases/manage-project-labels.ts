import { err, type Result } from "neverthrow";
import type { ProjectLabel } from "../../domain/entities/project-label";
import type {
  ProjectLabelRepository,
  ProjectLabelRepositoryError,
} from "../../domain/repositories/project-label-repository";
import {
  INVALID_LABEL_COLOR_ERROR,
  INVALID_LABEL_NAME_ERROR,
  normalizeLabelColor,
  normalizeLabelName,
} from "./project-label-input";

export type ManageProjectLabelError =
  | ProjectLabelRepositoryError
  | typeof INVALID_LABEL_NAME_ERROR
  | typeof INVALID_LABEL_COLOR_ERROR;

export async function createProjectLabel(
  repository: ProjectLabelRepository,
  input: { projectId: string; name: string; color: string },
): Promise<Result<ProjectLabel, ManageProjectLabelError>> {
  const nameResult = normalizeLabelName(input.name);
  if (nameResult.isErr()) {
    return err(nameResult.error);
  }

  const colorResult = normalizeLabelColor(input.color);
  if (colorResult.isErr()) {
    return err(colorResult.error);
  }

  return repository.create({
    projectId: input.projectId,
    name: nameResult.value,
    color: colorResult.value,
  });
}

export async function updateProjectLabel(
  repository: ProjectLabelRepository,
  input: { projectId: string; id: string; name?: string; color?: string },
): Promise<Result<ProjectLabel | null, ManageProjectLabelError>> {
  let normalizedName: string | undefined;
  let normalizedColor: string | undefined;

  if (input.name !== undefined) {
    const nameResult = normalizeLabelName(input.name);
    if (nameResult.isErr()) {
      return err(nameResult.error);
    }
    normalizedName = nameResult.value;
  }

  if (input.color !== undefined) {
    const colorResult = normalizeLabelColor(input.color);
    if (colorResult.isErr()) {
      return err(colorResult.error);
    }
    normalizedColor = colorResult.value;
  }

  return repository.update({
    id: input.id,
    projectId: input.projectId,
    ...(normalizedName !== undefined ? { name: normalizedName } : {}),
    ...(normalizedColor !== undefined ? { color: normalizedColor } : {}),
  });
}

export async function deleteProjectLabel(
  repository: ProjectLabelRepository,
  projectId: string,
  id: string,
): Promise<Result<boolean, ProjectLabelRepositoryError>> {
  return repository.delete(projectId, id);
}

export async function listProjectLabels(
  repository: ProjectLabelRepository,
  projectId: string,
): Promise<Result<ProjectLabel[], ProjectLabelRepositoryError>> {
  return repository.list(projectId);
}
