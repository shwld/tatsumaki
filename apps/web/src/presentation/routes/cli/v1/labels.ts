import { Hono } from "hono";
import {
  createProjectLabel,
  listProjectLabels,
} from "../../../../application/usecases/manage-project-labels";
import {
  INVALID_LABEL_COLOR_ERROR,
  INVALID_LABEL_NAME_ERROR,
} from "../../../../application/usecases/project-label-input";
import { PROJECT_LABEL_DUPLICATE_NAME_ERROR } from "../../../../domain/repositories/project-label-repository";
import { D1ProjectLabelRepository } from "../../../../infrastructure/db/repositories/d1-project-label-repository";
import type { Env } from "../../../../index";
import { requireProjectMembership } from "../../project-membership";

export const cliV1LabelsRoute = new Hono<Env>();

cliV1LabelsRoute.get("/:projectId/labels", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const result = await listProjectLabels(
    new D1ProjectLabelRepository(c.env.DB),
    projectId,
  );
  if (result.isErr()) {
    return c.json({ error: "Failed to load labels" }, 500);
  }

  return c.json({
    labels: result.value.map(({ id, name, color }) => ({ id, name, color })),
  });
});

cliV1LabelsRoute.post("/:projectId/labels", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }
  if (membership.member.role === "viewer") {
    return c.json({ error: "Viewers cannot change labels" }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const { name, color } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || typeof color !== "string") {
    return c.json({ error: "name and color are required" }, 400);
  }

  const result = await createProjectLabel(
    new D1ProjectLabelRepository(c.env.DB),
    { projectId, name, color },
  );
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

  const { id, name: createdName, color: createdColor } = result.value;
  return c.json({ label: { id, name: createdName, color: createdColor } }, 201);
});
