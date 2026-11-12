import { env } from "cloudflare:test";
import { asc, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/infrastructure/db/client";
import { D1StoryRepository } from "../src/infrastructure/db/repositories/d1-story-repository";
import {
  STORY_ARCHIVED_ERROR,
  STORY_PLACEMENT_ANCHOR_NOT_IN_BACKLOG_ERROR,
  type CreateStoryInput,
} from "../src/domain/repositories/story-repository";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import { storiesTable } from "../src/infrastructure/db/schema/stories";
import { resetDatabase } from "./helpers/db";

const PROJECT_ID = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TA";

const baseInput = (title: string): CreateStoryInput => ({
  projectId: PROJECT_ID,
  title,
  description: "-",
  type: "chore",
  status: "Unstarted",
  storyPoint: null,
  labelIds: [],
  isIcebox: false,
  ownerIds: [],
  requesterId: null,
});

async function seed(titles: string[]) {
  const db = createDb(env.DB);
  const timestamp = new Date().toISOString();
  await db.insert(storiesTable).values(
    titles.map((title, index) => ({
      id: `story-${title}`,
      storyNumber: index + 1,
      projectId: PROJECT_ID,
      title,
      description: "-",
      type: "chore",
      status: "Unstarted",
      storyPoint: null,
      iterationId: null,
      position: index + 1,
      isIcebox: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  );
}

async function backlogTitles() {
  const rows = await createDb(env.DB)
    .select({ title: storiesTable.title })
    .from(storiesTable)
    .where(isNull(storiesTable.archivedAt))
    .orderBy(asc(storiesTable.position), asc(storiesTable.id))
    .all();
  return rows.map((row) => row.title);
}

async function storyCount() {
  return (await createDb(env.DB).select().from(storiesTable).all()).length;
}

describe("D1StoryRepository placement", () => {
  const repository = () => new D1StoryRepository(env.DB);

  beforeEach(async () => {
    await resetDatabase(env.DB);
    await createDb(env.DB)
      .insert(projectsTable)
      .values({ id: PROJECT_ID, name: "Project" });
    await seed(["A", "B", "C"]);
  });

  it("creates a story right before and after its anchor", async () => {
    const before = await repository().create({
      ...baseInput("X"),
      placement: { position: "before", anchorId: "story-B" },
    });
    expect(before.isOk()).toBe(true);
    expect(await backlogTitles()).toEqual(["A", "X", "B", "C"]);

    const after = await repository().create({
      ...baseInput("Y"),
      placement: { position: "after", anchorId: "story-C" },
    });
    expect(after.isOk()).toBe(true);
    expect(await backlogTitles()).toEqual(["A", "X", "B", "C", "Y"]);
  });

  it("creates a story on top and at the end", async () => {
    await repository().create({
      ...baseInput("Top"),
      placement: { position: "top" },
    });
    await repository().create({
      ...baseInput("End"),
      placement: { position: "end" },
    });
    expect(await backlogTitles()).toEqual(["Top", "A", "B", "C", "End"]);
  });

  it("writes no story when the anchor was moved to the Icebox after validation", async () => {
    await createDb(env.DB)
      .update(storiesTable)
      .set({ isIcebox: 1 })
      .where(eq(storiesTable.id, "story-B"));

    const result = await repository().create({
      ...baseInput("X"),
      placement: { position: "after", anchorId: "story-B" },
    });

    expect(result._unsafeUnwrapErr()).toBe(
      STORY_PLACEMENT_ANCHOR_NOT_IN_BACKLOG_ERROR,
    );
    expect(await storyCount()).toBe(3);
    expect(await backlogTitles()).toEqual(["A", "B", "C"]);
  });

  it("writes no story when the anchor was archived after validation", async () => {
    await createDb(env.DB)
      .update(storiesTable)
      .set({ archivedAt: new Date().toISOString() })
      .where(eq(storiesTable.id, "story-B"));

    const result = await repository().create({
      ...baseInput("X"),
      placement: { position: "before", anchorId: "story-B" },
    });

    expect(result._unsafeUnwrapErr()).toBe(STORY_ARCHIVED_ERROR);
    expect(await storyCount()).toBe(3);
  });

  it("updates fields and moves the story in one write", async () => {
    const result = await repository().update({
      projectId: PROJECT_ID,
      id: "story-C",
      title: "C2",
      placement: { position: "before", anchorId: "story-A" },
    });

    expect(result.isOk()).toBe(true);
    expect(await backlogTitles()).toEqual(["C2", "A", "B"]);
    const history = await repository().listPriorityHistory(PROJECT_ID);
    expect(
      history._unsafeUnwrap().map((entry) => [entry.storyId, entry.toPosition]),
    ).toEqual(
      expect.arrayContaining([
        ["story-C", 1],
        ["story-A", 2],
        ["story-B", 3],
      ]),
    );
    expect(history._unsafeUnwrap()).toHaveLength(3);
  });

  it("leaves the story untouched when the anchor became unusable", async () => {
    await createDb(env.DB)
      .update(storiesTable)
      .set({ isIcebox: 1 })
      .where(eq(storiesTable.id, "story-A"));

    const result = await repository().update({
      projectId: PROJECT_ID,
      id: "story-C",
      title: "C2",
      placement: { position: "after", anchorId: "story-A" },
    });

    expect(result._unsafeUnwrapErr()).toBe(
      STORY_PLACEMENT_ANCHOR_NOT_IN_BACKLOG_ERROR,
    );
    expect(await backlogTitles()).toEqual(["A", "B", "C"]);
    const history = await repository().listPriorityHistory(PROJECT_ID);
    expect(history._unsafeUnwrap()).toHaveLength(0);
  });
});
