import type { Context } from "hono";
import { setStoryArchived } from "../../../application/usecases/set-story-archived";
import { D1StoryArchiveRepository } from "../../../infrastructure/db/repositories/d1-story-archive-repository";
import { D1StoryRepository } from "../../../infrastructure/db/repositories/d1-story-repository";
import type { ProjectMember } from "../../../domain/entities/project-member";
import type { Env } from "../../../index";
import { parseStoryNumberReference } from "../../lib/story-number-reference";
import { requireProjectMembership } from "../project-membership";

export async function handleStoryArchive(
  c: Context<Env>,
  archived: boolean,
  options?: { actorName?: string; member?: ProjectMember },
): Promise<Response> {
  const projectId = c.req.param("projectId") ?? "";
  if (!options?.member) {
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) return membership.response;
    if (membership.member.role === "viewer")
      return c.json({ error: "Viewers cannot archive stories" }, 403);
  }
  const number = parseStoryNumberReference(c.req.param("storyNumber") ?? "");
  if (number === null) return c.json({ error: "Story not found" }, 404);
  const stories = new D1StoryRepository(c.env.DB);
  const found = await stories.findByStoryNumber(projectId, number);
  if (found.isErr()) return c.json({ error: "Failed to fetch story" }, 500);
  if (!found.value) return c.json({ error: "Story not found" }, 404);
  const user = c.get("currentUser");
  const result = await setStoryArchived(
    stories,
    new D1StoryArchiveRepository(c.env.DB),
    {
      projectId,
      storyId: found.value.id,
      archived,
      actorId: user.id,
      actorName: options?.actorName ?? user.email ?? user.id,
    },
  );
  if (result.isErr()) {
    if (result.error === "STORY_ARCHIVE_INVALID_STATUS")
      return c.json(
        { error: "Only unstarted or rejected stories can be archived" },
        409,
      );
    if (result.error === "STORY_ARCHIVE_CONFLICT")
      return c.json({ error: "Story changed concurrently" }, 409);
    if (result.error === "STORY_NOT_FOUND")
      return c.json({ error: "Story not found" }, 404);
    return c.json({ error: "Failed to change archive state" }, 500);
  }
  return c.json({ story: result.value });
}
