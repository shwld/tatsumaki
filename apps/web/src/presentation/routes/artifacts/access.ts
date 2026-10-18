import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../../../index";
import type { ProjectMember } from "../../../domain/entities/project-member";
import { D1ProjectRepository } from "../../../infrastructure/db/repositories/d1-project-repository";

export type ArtifactAccess =
  | { ok: true; member: ProjectMember; userId: string }
  | { ok: false; response: Response };

/**
 * Artifact-specific membership guard. Unlike requireProjectMembership it
 * answers 404 to non-members so project existence is not revealed (ADR-0010).
 * Role checks beyond viewer-vs-writer happen in the use cases.
 */
export async function requireArtifactAccess(
  c: Context<Env>,
  projectId: string,
  options: { write: boolean },
): Promise<ArtifactAccess> {
  const notFound = () => c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

  const keyProjectId = c.get("apiKeyProjectId");
  if (keyProjectId !== undefined && keyProjectId !== projectId) {
    return { ok: false, response: notFound() };
  }

  const userId = c.get("currentUser").id;
  const repository = new D1ProjectRepository(c.env.DB);
  const member = await repository.findMember(projectId, userId);
  if (member.isErr()) {
    return {
      ok: false,
      response: c.json(
        { error: "Failed to load project membership", code: "INTERNAL_ERROR" },
        500,
      ),
    };
  }
  if (!member.value) return { ok: false, response: notFound() };

  if (options.write && member.value.role === "viewer") {
    return {
      ok: false,
      response: c.json(
        { error: "Viewers cannot modify artifacts", code: "FORBIDDEN" },
        403,
      ),
    };
  }
  return { ok: true, member: member.value, userId };
}

/**
 * Runs before any API key scope check so that a key issued to another project
 * is answered with the same 404 whatever scopes it has.
 */
export function requireApiKeyForProject(): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (c.get("apiKeyProjectId") !== c.req.param("projectId")) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    await next();
  };
}
