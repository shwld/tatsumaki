import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { INVALID_STORY_IS_ICEBOX_ERROR } from "../src/domain/entities/story";
import { createDb } from "../src/infrastructure/db/client";
import { D1StoryRepository } from "../src/infrastructure/db/repositories/d1-story-repository";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import { storiesTable } from "../src/infrastructure/db/schema/stories";
import { resetDatabase } from "./helpers/db";

const PROJECT_ID = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TA";
const STORY_ID = "story-01";

async function insertStory(status: string, isIcebox: number) {
  const timestamp = new Date().toISOString();
  await createDb(env.DB).insert(storiesTable).values({
    id: STORY_ID,
    storyNumber: 1,
    projectId: PROJECT_ID,
    title: "Story",
    description: "-",
    type: "feature",
    status,
    storyPoint: 3,
    labels: "[]",
    iterationId: null,
    position: 1,
    isIcebox,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

async function storedStory() {
  return createDb(env.DB)
    .select()
    .from(storiesTable)
    .where(eq(storiesTable.id, STORY_ID))
    .get();
}

describe("D1StoryRepository.update Icebox invariant", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await createDb(env.DB)
      .insert(projectsTable)
      .values({ id: PROJECT_ID, name: "Project" });
  });

  it("takes a story out of the Icebox even when the caller omits isIcebox", async () => {
    await insertStory("Unstarted", 1);

    const result = await new D1StoryRepository(env.DB).update({
      projectId: PROJECT_ID,
      id: STORY_ID,
      status: "Started",
    });

    expect(result.isOk()).toBe(true);
    expect(await storedStory()).toMatchObject({
      status: "Started",
      isIcebox: 0,
    });
  });

  it("rejects moving a story that is already started into the Icebox", async () => {
    await insertStory("Started", 0);

    const result = await new D1StoryRepository(env.DB).update({
      projectId: PROJECT_ID,
      id: STORY_ID,
      isIcebox: true,
    });

    expect(result._unsafeUnwrapErr()).toBe(INVALID_STORY_IS_ICEBOX_ERROR);
    expect(await storedStory()).toMatchObject({
      status: "Started",
      isIcebox: 0,
    });
  });

  it("allows an Icebox story to be edited while it stays Unstarted", async () => {
    await insertStory("Unstarted", 1);

    const result = await new D1StoryRepository(env.DB).update({
      projectId: PROJECT_ID,
      id: STORY_ID,
      title: "Renamed",
    });

    expect(result.isOk()).toBe(true);
    expect(await storedStory()).toMatchObject({
      title: "Renamed",
      isIcebox: 1,
    });
  });
});
