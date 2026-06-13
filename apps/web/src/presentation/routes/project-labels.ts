import { Hono } from "hono";
import {
  createProjectLabel,
  deleteProjectLabel,
  listProjectLabels,
  updateProjectLabel,
} from "../../application/usecases/manage-project-labels";
import {
  INVALID_LABEL_COLOR_ERROR,
  INVALID_LABEL_NAME_ERROR,
} from "../../application/usecases/project-label-input";
import { PROJECT_LABEL_DUPLICATE_NAME_ERROR } from "../../domain/repositories/project-label-repository";
import { D1ProjectLabelRepository } from "../../infrastructure/db/repositories/d1-project-label-repository";
import type { Env } from "../../index";
import { requireProjectMembership } from "./project-membership";

export const projectLabelsRoute = new Hono<Env>();

projectLabelsRoute.get("/projects/:projectId/labels", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const repository = new D1ProjectLabelRepository(c.env.DB);
  const result = await listProjectLabels(repository, projectId);

  if (result.isErr()) {
    return c.json({ error: "Failed to load labels" }, 500);
  }

  return c.json({ labels: result.value });
});

projectLabelsRoute.post("/projects/:projectId/labels", async (c) => {
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
    typeof (body as Record<string, unknown>).name !== "string" ||
    !("color" in body) ||
    typeof (body as Record<string, unknown>).color !== "string"
  ) {
    return c.json({ error: "name and color are required" }, 400);
  }

  const { name, color } = body as { name: string; color: string };

  const repository = new D1ProjectLabelRepository(c.env.DB);
  const result = await createProjectLabel(repository, {
    projectId,
    name,
    color,
  });

  if (result.isErr()) {
    if (result.error === INVALID_LABEL_NAME_ERROR) {
      return c.json({ error: "Label name must be 1-50 characters" }, 400);
    }
    if (result.error === INVALID_LABEL_COLOR_ERROR) {
      return c.json(
        { error: "Color must be a valid hex color (e.g. #ff0000)" },
        400,
      );
    }
    if (result.error === PROJECT_LABEL_DUPLICATE_NAME_ERROR) {
      return c.json({ error: "A label with this name already exists" }, 409);
    }
    return c.json({ error: "Failed to create label" }, 500);
  }

  return c.json({ label: result.value }, 201);
});

projectLabelsRoute.patch("/projects/:projectId/labels/:labelId", async (c) => {
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
  const color = typeof raw.color === "string" ? raw.color : undefined;

  if (name === undefined && color === undefined) {
    return c.json({ error: "name or color is required" }, 400);
  }

  const repository = new D1ProjectLabelRepository(c.env.DB);
  const result = await updateProjectLabel(repository, {
    projectId,
    id: c.req.param("labelId"),
    ...(name !== undefined ? { name } : {}),
    ...(color !== undefined ? { color } : {}),
  });

  if (result.isErr()) {
    if (result.error === INVALID_LABEL_NAME_ERROR) {
      return c.json({ error: "Label name must be 1-50 characters" }, 400);
    }
    if (result.error === INVALID_LABEL_COLOR_ERROR) {
      return c.json(
        { error: "Color must be a valid hex color (e.g. #ff0000)" },
        400,
      );
    }
    if (result.error === PROJECT_LABEL_DUPLICATE_NAME_ERROR) {
      return c.json({ error: "A label with this name already exists" }, 409);
    }
    return c.json({ error: "Failed to update label" }, 500);
  }

  if (result.value === null) {
    return c.json({ error: "Label not found" }, 404);
  }

  return c.json({ label: result.value });
});

projectLabelsRoute.delete("/projects/:projectId/labels/:labelId", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const repository = new D1ProjectLabelRepository(c.env.DB);
  const result = await deleteProjectLabel(
    repository,
    projectId,
    c.req.param("labelId"),
  );

  if (result.isErr()) {
    return c.json({ error: "Failed to delete label" }, 500);
  }

  return c.body(null, 204);
});
