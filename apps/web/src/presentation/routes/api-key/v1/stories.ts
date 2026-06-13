import { Hono } from "hono";
import type { Env } from "../../../../index";
import { requireApiKeyScope } from "../../../middleware/api-key-auth";
import { requireProjectMembership } from "../../project-membership";
import { handleCliStoryUpdate } from "../../cli/v1/story-handlers";

export const apiKeyV1StoriesRoute = new Hono<Env>();

apiKeyV1StoriesRoute.patch(
  "/:projectId/stories/:storyNumber",
  requireApiKeyScope("story:write"),
  async (c) => {
    const projectId = c.req.param("projectId");

    // Ensure the API key was issued for this specific project (prevents IDOR)
    if (c.get("apiKeyProjectId") !== projectId) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    // API key owners who have been demoted to viewer lose edit permission
    if (membership.member.role === "viewer") {
      return c.json(
        { error: "API key owner no longer has edit permission" },
        403,
      );
    }

    const actorName = `API Key: ${c.get("apiKeyName")}`;
    return handleCliStoryUpdate(
      c,
      membership.member,
      membership.member.userId,
      actorName,
    );
  },
);
