import { Hono } from "hono";
import { listMyWorkStories } from "../../application/usecases/list-my-work-stories";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
import { D1StoryRepository } from "../../infrastructure/db/repositories/d1-story-repository";
import type { Env } from "../../index";

export const myWorkRoute = new Hono<Env>();

myWorkRoute.get("/my-work", async (c) => {
  const currentUser = c.get("currentUser");
  const projectRepository = new D1ProjectRepository(c.env.DB);
  const storyRepository = new D1StoryRepository(c.env.DB);

  const result = await listMyWorkStories(
    projectRepository,
    storyRepository,
    currentUser.id,
  );

  if (result.isErr()) {
    return c.json({ error: "Failed to load my work" }, 500);
  }

  return c.json({ projects: result.value });
});
