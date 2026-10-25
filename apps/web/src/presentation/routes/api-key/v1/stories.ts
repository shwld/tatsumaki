import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../../../../index";
import { requireApiKeyScope } from "../../../middleware/api-key-auth";
import { requireProjectMembership } from "../../project-membership";
import { changeStoryBlocker } from "../../stories/blocker-handlers";
import { handleCliStoryUpdate } from "../../cli/v1/story-handlers";

export const apiKeyV1StoriesRoute = new Hono<Env>();

async function requireApiKeyStoryEditor(c: Context<Env>, projectId: string) {
  // Ensure the API key was issued for this specific project (prevents IDOR)
  if (c.get("apiKeyProjectId") !== projectId) {
    return {
      ok: false,
      response: c.json({ error: "Forbidden" }, 403),
    } as const;
  }

  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership;
  }

  // API key owners who have been demoted to viewer lose edit permission
  if (membership.member.role === "viewer") {
    return {
      ok: false,
      response: c.json(
        { error: "API key owner no longer has edit permission" },
        403,
      ),
    } as const;
  }

  return membership;
}

apiKeyV1StoriesRoute.patch(
  "/:projectId/stories/:storyNumber",
  requireApiKeyScope("story:write"),
  async (c) => {
    const editor = await requireApiKeyStoryEditor(c, c.req.param("projectId"));
    if (!editor.ok) {
      return editor.response;
    }

    const actorName = `API Key: ${c.get("apiKeyName")}`;
    return handleCliStoryUpdate(
      c,
      editor.member,
      editor.member.userId,
      actorName,
    );
  },
);

for (const [method, action] of [
  ["post", "add"],
  ["delete", "remove"],
] as const) {
  apiKeyV1StoriesRoute[method](
    "/:projectId/stories/:storyNumber/blockers",
    requireApiKeyScope("story:write"),
    async (c) => {
      const projectId = c.req.param("projectId");
      const editor = await requireApiKeyStoryEditor(c, projectId);
      if (!editor.ok) {
        return editor.response;
      }

      const change = await changeStoryBlocker(c, { projectId, action });
      if (!change.ok) {
        return change.response;
      }

      return c.json({
        story: change.story,
        relatedStory: change.relatedStory,
        changed: change.changed,
      });
    },
  );
}
