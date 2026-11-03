import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { STORY_OWNER_NOT_PROJECT_MEMBER_ERROR } from "../src/domain/repositories/story-repository";
import { createDb } from "../src/infrastructure/db/client";
import { D1StoryRepository } from "../src/infrastructure/db/repositories/d1-story-repository";
import { projectMembersTable } from "../src/infrastructure/db/schema/project-members";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import {
  storiesTable,
  storyOwnersTable,
} from "../src/infrastructure/db/schema/stories";
import { resetDatabase } from "./helpers/db";

const PROJECT_ID = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TA";
const STORY_ID = "story-01";
const MEMBER_ID = "github|member";
const NEW_MEMBER_ID = "github|new-member";
const FORMER_MEMBER_ID = "github|former-member";

async function storedOwnerIds() {
  const rows = await createDb(env.DB)
    .select()
    .from(storyOwnersTable)
    .where(eq(storyOwnersTable.storyId, STORY_ID))
    .all();
  return rows.map((row) => row.userId).sort();
}

describe("D1StoryRepository.update owner membership", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    const db = createDb(env.DB);
    const timestamp = new Date().toISOString();
    await db.insert(projectsTable).values({ id: PROJECT_ID, name: "Project" });
    await db.insert(projectMembersTable).values([
      { projectId: PROJECT_ID, userId: MEMBER_ID, role: "member" },
      { projectId: PROJECT_ID, userId: NEW_MEMBER_ID, role: "member" },
    ]);
    await db.insert(storiesTable).values({
      id: STORY_ID,
      storyNumber: 1,
      projectId: PROJECT_ID,
      title: "Story",
      description: "-",
      type: "feature",
      status: "Unstarted",
      storyPoint: 3,
      labels: "[]",
      iterationId: null,
      position: 1,
      isIcebox: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.insert(storyOwnersTable).values([
      { storyId: STORY_ID, userId: MEMBER_ID },
      { storyId: STORY_ID, userId: FORMER_MEMBER_ID },
    ]);
  });

  it("returns saved owners in summaries so adding an owner preserves them", async () => {
    const repository = new D1StoryRepository(env.DB);
    const result = await repository.list({
      projectId: PROJECT_ID,
      detailLevel: "summary",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw new Error("Failed to list stories");
    expect(result.value[0]?.ownerIds.sort()).toEqual(
      [FORMER_MEMBER_ID, MEMBER_ID].sort(),
    );

    const updated = await repository.update({
      projectId: PROJECT_ID,
      id: STORY_ID,
      ownerIds: [...result.value[0]!.ownerIds, NEW_MEMBER_ID],
    });
    expect(updated.isOk()).toBe(true);
    expect(await storedOwnerIds()).toEqual(
      [FORMER_MEMBER_ID, MEMBER_ID, NEW_MEMBER_ID].sort(),
    );
  });

  it("rejects adding a non-member and leaves the story unchanged", async () => {
    const result = await new D1StoryRepository(env.DB).update({
      projectId: PROJECT_ID,
      id: STORY_ID,
      title: "Changed",
      ownerIds: [MEMBER_ID, FORMER_MEMBER_ID, "github|stranger"],
    });

    expect(result.isErr() && result.error).toBe(
      STORY_OWNER_NOT_PROJECT_MEMBER_ERROR,
    );
    expect(await storedOwnerIds()).toEqual([FORMER_MEMBER_ID, MEMBER_ID]);
    const story = await createDb(env.DB)
      .select()
      .from(storiesTable)
      .where(eq(storiesTable.id, STORY_ID))
      .get();
    expect(story?.title).toBe("Story");
  });

  it("keeps an already registered former member and accepts a new member", async () => {
    const result = await new D1StoryRepository(env.DB).update({
      projectId: PROJECT_ID,
      id: STORY_ID,
      ownerIds: [MEMBER_ID, FORMER_MEMBER_ID, NEW_MEMBER_ID],
    });

    expect(result.isOk()).toBe(true);
    expect(await storedOwnerIds()).toEqual(
      [FORMER_MEMBER_ID, MEMBER_ID, NEW_MEMBER_ID].sort(),
    );
  });

  it("allows removing a former member from the owners", async () => {
    const result = await new D1StoryRepository(env.DB).update({
      projectId: PROJECT_ID,
      id: STORY_ID,
      ownerIds: [MEMBER_ID],
    });

    expect(result.isOk()).toBe(true);
    expect(await storedOwnerIds()).toEqual([MEMBER_ID]);
  });
});
