import type { Context } from "hono";
import type { Env } from "../../index";
import type { ProjectMember } from "../../domain/entities/project-member";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";

export async function requireProjectMembership(
  c: Context<Env>,
  projectId: string,
): Promise<
  | { ok: true; member: ProjectMember; repository: D1ProjectRepository }
  | { ok: false; response: Response }
> {
  const repository = new D1ProjectRepository(c.env.DB);
  const currentUser = c.get("currentUser");

  const memberResult = await repository.findMember(projectId, currentUser.id);
  if (memberResult.isErr()) {
    return {
      ok: false,
      response: c.json({ error: "Failed to load project membership" }, 500),
    };
  }

  if (!memberResult.value) {
    return {
      ok: false,
      response: c.json(
        {
          error:
            "You do not have access to this project. Ask a project owner to invite you.",
        },
        403,
      ),
    };
  }

  return { ok: true, member: memberResult.value, repository };
}
