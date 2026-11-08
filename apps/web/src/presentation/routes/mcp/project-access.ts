import type { ProjectRepository } from "../../../domain/repositories/project-repository";

export async function requireProjectAccess(
  projectRepository: ProjectRepository,
  projectId: string,
  userId: string,
) {
  const memberResult = await projectRepository.findMember(projectId, userId);

  if (memberResult.isErr()) {
    return {
      ok: false as const,
      response: {
        content: [
          {
            type: "text" as const,
            text: "Failed to verify project membership.",
          },
        ],
        isError: true,
      },
    };
  }

  if (!memberResult.value) {
    return {
      ok: false as const,
      response: {
        content: [
          {
            type: "text" as const,
            text: "You do not have access to this project.",
          },
        ],
        isError: true,
      },
    };
  }

  return { ok: true as const, member: memberResult.value };
}
