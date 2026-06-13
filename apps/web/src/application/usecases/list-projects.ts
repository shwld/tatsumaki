import type { Result } from "neverthrow";
import type { Project } from "../../domain/entities/project";
import type {
  ProjectRepository,
  ProjectRepositoryError,
} from "../../domain/repositories/project-repository";

export async function listProjects(
  repository: ProjectRepository,
  userId: string,
): Promise<Result<Project[], ProjectRepositoryError>> {
  return repository.listByMember(userId);
}
