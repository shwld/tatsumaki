import type { Result } from "neverthrow";
import type {
  ProjectMember,
  ProjectMemberRole,
} from "../../domain/entities/project-member";
import type {
  ProjectRepository,
  UpdateMemberRoleError,
} from "../../domain/repositories/project-repository";

export async function changeProjectMemberRole(
  deps: {
    projects: Pick<ProjectRepository, "updateMemberRole">;
  },
  input: {
    projectId: string;
    userId: string;
    role: ProjectMemberRole;
    now: Date;
  },
): Promise<Result<ProjectMember | null, UpdateMemberRoleError>> {
  const result = await deps.projects.updateMemberRole(input);
  return result.map((change) => change?.member ?? null);
}
