import { Hono } from "hono";
import { listProjectLabels } from "../../../../application/usecases/manage-project-labels";
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
