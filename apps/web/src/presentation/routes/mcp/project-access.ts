import type { ProjectRepository } from "../../../domain/repositories/project-repository";
import {
  decideProjectWrite,
  toProjectWriteDenial,
  type ProjectWriteGuardBindings,
} from "../../../infrastructure/entitlements/project-write-guard";

export async function requireProjectAccess(
  projectRepository: ProjectRepository,
  projectId: string,
  userId: string,
  writeGuard?: ProjectWriteGuardBindings,
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

  if (writeGuard) {
    const denial = toProjectWriteDenial(
      await decideProjectWrite(writeGuard, projectId),
    );
    if (denial) {
      return {
        ok: false as const,
        response: {
          content: [
            {
              type: "text" as const,
              text: `${denial.body.code}: ${denial.body.error}`,
            },
          ],
          isError: true,
        },
      };
    }
  }

  return { ok: true as const, member: memberResult.value };
}
