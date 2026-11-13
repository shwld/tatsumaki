import { Hono } from "hono";
import { getProject } from "../../../../application/usecases/get-project";
import type { Env } from "../../../../index";
import { requireProjectMembership } from "../../project-membership";
import { createArtifactRoutes } from "../../artifacts/routes";
import { createEpicRoutes } from "../../epics/routes";
import { createStoryMapRoutes } from "../../story-maps";
import { storyMapCommandsRoute } from "../../story-map-live";
import { cliV1LabelsRoute } from "./labels";
import { cliV1StoriesRoute } from "./stories";

export const cliV1ProjectsRoute = new Hono<Env>();
cliV1ProjectsRoute.route("/", cliV1StoriesRoute);
cliV1ProjectsRoute.route("/", cliV1LabelsRoute);
cliV1ProjectsRoute.route("/", createEpicRoutes());
cliV1ProjectsRoute.route("/", createStoryMapRoutes());
cliV1ProjectsRoute.route("/", storyMapCommandsRoute);
cliV1ProjectsRoute.route(
  "/",
  createArtifactRoutes({ readMiddleware: [], writeMiddleware: [] }),
);

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
