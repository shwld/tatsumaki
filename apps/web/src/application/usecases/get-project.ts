import type { Result } from "neverthrow";
import type { Project } from "../../domain/entities/project";
import type {
  ProjectRepository,
  ProjectRepositoryError,
} from "../../domain/repositories/project-repository";

export async function getProject(
  repository: ProjectRepository,
  input: {
    projectId: string;
  },
): Promise<Result<Project | null, ProjectRepositoryError>> {
  return repository.findById(input.projectId);
}
