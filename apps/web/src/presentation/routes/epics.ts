import { Hono } from "hono";
import {
  createEpic,
  deleteEpic,
  listEpics,
  updateEpic,
} from "../../application/usecases/manage-epics";
import {
  INVALID_EPIC_DESCRIPTION_ERROR,
  INVALID_EPIC_NAME_ERROR,
} from "../../application/usecases/epic-input";
import { EPIC_DUPLICATE_NAME_ERROR } from "../../domain/repositories/epic-repository";
import { D1EpicRepository } from "../../infrastructure/db/repositories/d1-epic-repository";
import type { Env } from "../../index";
import { requireProjectMembership } from "./project-membership";

export const epicsRoute = new Hono<Env>();

epicsRoute.get("/projects/:projectId/epics", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const repository = new D1EpicRepository(c.env.DB);
  const result = await listEpics(repository, projectId);

  if (result.isErr()) {
    return c.json({ error: "Failed to load epics" }, 500);
  }

  return c.json({ epics: result.value });
});

epicsRoute.post("/projects/:projectId/epics", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("name" in body) ||
    typeof (body as Record<string, unknown>).name !== "string"
  ) {
    return c.json({ error: "name is required" }, 400);
  }

  const raw = body as Record<string, unknown>;
  const repository = new D1EpicRepository(c.env.DB);
  const result = await createEpic(repository, {
    projectId,
    name: raw.name as string,
    description:
      typeof raw.description === "string" ? raw.description : undefined,
  });

  if (result.isErr()) {
    if (result.error === INVALID_EPIC_NAME_ERROR) {
      return c.json({ error: "Epic name must be 1-100 characters" }, 400);
    }
    if (result.error === INVALID_EPIC_DESCRIPTION_ERROR) {
      return c.json(
        { error: "Epic description must be at most 500 characters" },
        400,
      );
    }
    if (result.error === EPIC_DUPLICATE_NAME_ERROR) {
      return c.json({ error: "An epic with this name already exists" }, 409);
    }
    return c.json({ error: "Failed to create epic" }, 500);
  }

  return c.json({ epic: result.value }, 201);
});

epicsRoute.patch("/projects/:projectId/epics/:epicId", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const raw = body as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name : undefined;
  const description =
    typeof raw.description === "string" ? raw.description : undefined;

  if (name === undefined && description === undefined) {
    return c.json({ error: "name or description is required" }, 400);
  }

  const repository = new D1EpicRepository(c.env.DB);
  const result = await updateEpic(repository, {
    projectId,
    id: c.req.param("epicId"),
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
  });

  if (result.isErr()) {
    if (result.error === INVALID_EPIC_NAME_ERROR) {
      return c.json({ error: "Epic name must be 1-100 characters" }, 400);
    }
    if (result.error === INVALID_EPIC_DESCRIPTION_ERROR) {
      return c.json(
        { error: "Epic description must be at most 500 characters" },
        400,
      );
    }
    if (result.error === EPIC_DUPLICATE_NAME_ERROR) {
      return c.json({ error: "An epic with this name already exists" }, 409);
    }
    return c.json({ error: "Failed to update epic" }, 500);
  }

  if (!result.value) {
    return c.json({ error: "Epic not found" }, 404);
  }

  return c.json({ epic: result.value });
});

epicsRoute.delete("/projects/:projectId/epics/:epicId", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const repository = new D1EpicRepository(c.env.DB);
  const result = await deleteEpic(repository, projectId, c.req.param("epicId"));

  if (result.isErr()) {
    return c.json({ error: "Failed to delete epic" }, 500);
  }

  return c.body(null, 204);
});
