import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/infrastructure/db/client";
import { D1StoryRepository } from "../src/infrastructure/db/repositories/d1-story-repository";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import { projectLabelsTable } from "../src/infrastructure/db/schema/project-labels";
import { storyLabelsTable } from "../src/infrastructure/db/schema/story-labels";
import { storiesTable } from "../src/infrastructure/db/schema/stories";
import { resetDatabase } from "./helpers/db";

const PROJECT_ID = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TA";

describe("D1StoryRepository.list summary labels", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    const db = createDb(env.DB);
    const timestamp = new Date().toISOString();
    await db.insert(projectsTable).values({ id: PROJECT_ID, name: "Project" });
    await db.insert(storiesTable).values(
      [1, 2, 3].map((n) => ({
        id: `story-0${n}`,
        storyNumber: n,
        projectId: PROJECT_ID,
        title: `Story ${n}`,
        description: "-",
        type: "feature",
        status: "Unstarted",
        storyPoint: 1,
        iterationId: null,
        position: n,
        isIcebox: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
    await db.insert(projectLabelsTable).values([
      { id: "label-a", projectId: PROJECT_ID, name: "alpha" },
      { id: "label-b", projectId: PROJECT_ID, name: "beta" },
    ]);
    await db.insert(storyLabelsTable).values([
      { projectId: PROJECT_ID, storyId: "story-01", labelId: "label-b" },
      { projectId: PROJECT_ID, storyId: "story-01", labelId: "label-a" },
      { projectId: PROJECT_ID, storyId: "story-02", labelId: "label-a" },
    ]);
  });

  it("returns labels as {id, name} for each story, empty when unlabeled", async () => {
    const repository = new D1StoryRepository(env.DB);
    const result = await repository.list({
      projectId: PROJECT_ID,
      detailLevel: "summary",
    });
    if (result.isErr()) throw new Error("Failed to list stories");

    const byId = new Map(result.value.map((story) => [story.id, story]));
    expect(byId.get("story-01")?.labels).toEqual([
      { id: "label-a", name: "alpha" },
      { id: "label-b", name: "beta" },
    ]);
    expect(byId.get("story-02")?.labels).toEqual([
      { id: "label-a", name: "alpha" },
    ]);
    expect(byId.get("story-03")?.labels).toEqual([]);
  });
});
