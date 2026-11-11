import { Hono, type Context } from "hono";
import {
  createStoryMap,
  INVALID_STORY_MAP_INPUT_ERROR,
  listStoryMaps,
  type ManageStoryMapError,
  STORY_MAP_ELEMENT_NOT_FOUND_ERROR,
  STORY_MAP_FORBIDDEN_ERROR,
  STORY_MAP_NOT_FOUND_ERROR,
  type StoryMapDependencies,
  getStoryMap,
} from "../../application/usecases/manage-story-maps";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
import { D1StoryMapRepository } from "../../infrastructure/db/repositories/d1-story-map-repository";
import type { Env } from "../../index";
import { requireProjectMembership } from "./project-membership";

function dependencies(c: Context<Env>): StoryMapDependencies {
  return {
    storyMapRepository: new D1StoryMapRepository(c.env.DB),
    projectRepository: new D1ProjectRepository(c.env.DB),
  };
}

function errorResponse(c: Context<Env>, error: ManageStoryMapError) {
  switch (error) {
    case STORY_MAP_FORBIDDEN_ERROR:
      return c.json(
        { error: "You cannot change this story map", code: "FORBIDDEN" },
        403,
      );
    case STORY_MAP_NOT_FOUND_ERROR:
    case STORY_MAP_ELEMENT_NOT_FOUND_ERROR:
      return c.json(
        { error: "Story map not found", code: "STORY_MAP_NOT_FOUND" },
        404,
      );
    case INVALID_STORY_MAP_INPUT_ERROR:
      return c.json(
        { error: "Invalid story map input", code: "INVALID_INPUT" },
        400,
      );
    default:
      return c.json({ error: "Failed to process story map" }, 500);
  }
}

async function readObject(
  c: Context<Env>,
): Promise<Record<string, unknown> | null> {
  const body: unknown = await c.req.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function optionalString(
  body: Record<string, unknown>,
  key: string,
): { ok: true; value: string | undefined } | { ok: false } {
  const value = body[key];
  if (value === undefined) return { ok: true, value: undefined };
  return typeof value === "string" ? { ok: true, value } : { ok: false };
}

const invalidBody = (c: Context<Env>) =>
  c.json({ error: "Invalid story map input", code: "INVALID_INPUT" }, 400);

/** Story map list, create and metadata edits. Mounted under ".../projects". */
export function createStoryMapRoutes() {
  const app = new Hono<Env>();
  const userId = (c: Context<Env>) => c.get("currentUser").id;

  app.get("/:projectId/story-maps", async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) return membership.response;
    const result = await listStoryMaps(dependencies(c), {
      projectId,
      userId: userId(c),
      includeArchived: c.req.query("includeArchived") === "true",
    });
    if (result.isErr()) return errorResponse(c, result.error);
    return c.json({ storyMaps: result.value, role: membership.member.role });
  });

  app.post("/:projectId/story-maps", async (c) => {
    const body = await readObject(c);
    if (!body || typeof body.title !== "string") return invalidBody(c);
    const goal = optionalString(body, "achievementGoal");
    const names = body.personaNames;
    if (
      !goal.ok ||
      (names !== undefined &&
        (!Array.isArray(names) ||
          names.some((name) => typeof name !== "string")))
    ) {
      return invalidBody(c);
    }
    const result = await createStoryMap(dependencies(c), {
      projectId: c.req.param("projectId"),
      userId: userId(c),
      title: body.title,
      achievementGoal: goal.value,
      personaNames: names as string[] | undefined,
    });
    if (result.isErr()) return errorResponse(c, result.error);
    return c.json({ storyMap: result.value }, 201);
  });

  app.get("/:projectId/story-maps/:mapId", async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) return membership.response;
    const result = await getStoryMap(dependencies(c), {
      projectId,
      mapId: c.req.param("mapId"),
      userId: userId(c),
    });
    if (result.isErr()) return errorResponse(c, result.error);
    return c.json({ structure: result.value, role: membership.member.role });
  });

  return app;
}
