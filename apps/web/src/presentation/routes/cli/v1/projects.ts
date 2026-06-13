import { Hono } from "hono";
import { getProject } from "../../../../application/usecases/get-project";
import type { Env } from "../../../../index";
import { requireProjectMembership } from "../../project-membership";
import { cliV1StoriesRoute } from "./stories";

export const cliV1ProjectsRoute = new Hono<Env>();
cliV1ProjectsRoute.route("/", cliV1StoriesRoute);

cliV1ProjectsRoute.get("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const projectResult = await getProject(membership.repository, { projectId });
  if (projectResult.isErr()) {
    return c.json({ error: "Failed to fetch project" }, 500);
  }
  if (!projectResult.value) {
    return c.json({ error: "Project not found" }, 404);
  }

  return c.json({ project: projectResult.value });
});
