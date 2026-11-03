import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { setStoryArchived } from "../src/application/usecases/set-story-archived";
import { canArchiveStory } from "../src/domain/entities/story";
import { createDb } from "../src/infrastructure/db/client";
import { D1StoryRepository } from "../src/infrastructure/db/repositories/d1-story-repository";
import { D1StoryArchiveRepository } from "../src/infrastructure/db/repositories/d1-story-archive-repository";
import { D1StoryActivityRepository } from "../src/infrastructure/db/repositories/d1-story-activity-repository";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import { storiesTable } from "../src/infrastructure/db/schema/stories";
import { iterationsTable } from "../src/infrastructure/db/schema/iterations";
import { resetDatabase } from "./helpers/db";

const projectId = "archive-test-project";

describe("story archive filtering", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    const db = createDb(env.DB);
    await db.insert(projectsTable).values({ id: projectId, name: "Project" });
    await db.insert(storiesTable).values([
      {
        id: "active",
        projectId,
        storyNumber: 1,
        title: "Active",
        description: "",
        position: 1,
      },
      {
        id: "archived",
        projectId,
        storyNumber: 2,
        title: "Archived",
        description: "",
        position: 2,
        archivedAt: "2026-11-03T00:00:00.000Z",
      },
    ]);
  });

  it("excludes archived stories by default and supports explicit filters", async () => {
    const repo = new D1StoryRepository(env.DB);
    expect(
      (await repo.list({ projectId }))._unsafeUnwrap().map((s) => s.id),
    ).toEqual(["active"]);
    expect(
      (await repo.list({ projectId, archived: "only" }))
        ._unsafeUnwrap()
        .map((s) => s.id),
    ).toEqual(["archived"]);
    expect(
      (await repo.list({ projectId, archived: "include" }))
        ._unsafeUnwrap()
        .map((s) => s.id),
    ).toEqual(["active", "archived"]);
    expect((await repo.summarize({ projectId }))._unsafeUnwrap().total).toBe(1);
  });

  it("does not expose or reorder archived stories", async () => {
    const repo = new D1StoryRepository(env.DB);
    expect(
      (
        await repo.reorder({ projectId, orderedIds: ["archived"] })
      )._unsafeUnwrap(),
    ).toBeNull();
    expect(
      (await repo.reorder({ projectId, orderedIds: ["active"] }))
        ._unsafeUnwrap()
        ?.map((s) => s.id),
    ).toEqual(["active"]);
  });

  it("allows only unstarted and rejected statuses", () => {
    expect(
      ["Unstarted", "Rejected"].every((status) =>
        canArchiveStory(status as "Unstarted" | "Rejected"),
      ),
    ).toBe(true);
    expect(
      ["Started", "Finished", "Delivered", "Accepted"].every(
        (status) =>
          !canArchiveStory(
            status as "Started" | "Finished" | "Delivered" | "Accepted",
          ),
      ),
    ).toBe(true);
  });

  it("archives and restores a story with history", async () => {
    const stories = new D1StoryRepository(env.DB);
    const archive = new D1StoryArchiveRepository(env.DB);
    const input = {
      projectId,
      storyId: "active",
      actorId: "user",
      actorName: "User",
    };
    const archived = await setStoryArchived(stories, archive, {
      ...input,
      archived: true,
    });
    expect(archived._unsafeUnwrap().archivedAt).not.toBeNull();
    expect((await stories.list({ projectId }))._unsafeUnwrap()).toHaveLength(0);
    const restored = await setStoryArchived(stories, archive, {
      ...input,
      archived: false,
    });
    expect(restored._unsafeUnwrap().archivedAt).toBeNull();
    const history = await new D1StoryActivityRepository(env.DB).listByStory(
      projectId,
      "active",
    );
    expect(history._unsafeUnwrap().map((item) => item.action)).toEqual(
      expect.arrayContaining(["archived", "unarchived"]),
    );
  });

  it("rejects in-progress states but permits rejected stories", async () => {
    const stories = new D1StoryRepository(env.DB);
    const archive = new D1StoryArchiveRepository(env.DB);
    const input = {
      projectId,
      storyId: "active",
      actorId: "user",
      actorName: "User",
      archived: true,
    };
    for (const status of ["Started", "Finished", "Delivered", "Accepted"]) {
      await createDb(env.DB)
        .update(storiesTable)
        .set({ status })
        .where(eq(storiesTable.id, "active"));
      expect(
        (await setStoryArchived(stories, archive, input))._unsafeUnwrapErr(),
      ).toBe("STORY_ARCHIVE_INVALID_STATUS");
    }
    await createDb(env.DB)
      .update(storiesTable)
      .set({ status: "Rejected" })
      .where(eq(storiesTable.id, "active"));
    expect(
      (await setStoryArchived(stories, archive, input))._unsafeUnwrap()
        .archivedAt,
    ).not.toBeNull();
  });

  it("does not write an activity for a stale archive request", async () => {
    const stories = new D1StoryRepository(env.DB);
    const archive = new D1StoryArchiveRepository(env.DB);
    const story = (
      await stories.findById(projectId, "active")
    )._unsafeUnwrap()!;
    await createDb(env.DB)
      .update(storiesTable)
      .set({ status: "Started" })
      .where(eq(storiesTable.id, story.id));
    expect(
      (
        await archive.setArchived({
          story,
          archived: true,
          actorId: "user",
          actorName: "User",
        })
      )._unsafeUnwrap(),
    ).toBe(false);
    expect(
      (
        await new D1StoryActivityRepository(env.DB).listByStory(
          projectId,
          story.id,
        )
      )._unsafeUnwrap(),
    ).toHaveLength(0);
  });

  it("restores stories from an elapsed iteration to the backlog", async () => {
    const db = createDb(env.DB);
    await db.insert(iterationsTable).values({
      id: "past",
      projectId,
      iterationNumber: 1,
      startDate: "2020-01-01",
      endDate: "2020-01-15",
    });
    await db
      .update(storiesTable)
      .set({
        iterationId: "past",
        status: "Rejected",
        archivedAt: "2020-01-10T00:00:00Z",
      })
      .where(eq(storiesTable.id, "active"));
    const stories = new D1StoryRepository(env.DB);
    const result = await setStoryArchived(
      stories,
      new D1StoryArchiveRepository(env.DB),
      {
        projectId,
        storyId: "active",
        archived: false,
        actorId: "user",
        actorName: "User",
      },
    );
    expect(result._unsafeUnwrap()).toMatchObject({
      archivedAt: null,
      iterationId: null,
    });
    expect(
      (
        await stories.list({
          projectId,
          iterationDateScope: "future",
          includeUnassignedIteration: true,
        })
      )
        ._unsafeUnwrap()
        .map((story) => story.id),
    ).toContain("active");
  });

  it("retains a future iteration when restoring", async () => {
    const db = createDb(env.DB);
    await db.insert(iterationsTable).values({
      id: "future",
      projectId,
      iterationNumber: 1,
      startDate: "2099-01-01",
      endDate: "2099-01-15",
    });
    await db
      .update(storiesTable)
      .set({ iterationId: "future", archivedAt: "2020-01-10T00:00:00Z" })
      .where(eq(storiesTable.id, "active"));
    const stories = new D1StoryRepository(env.DB);
    const result = await setStoryArchived(
      stories,
      new D1StoryArchiveRepository(env.DB),
      {
        projectId,
        storyId: "active",
        archived: false,
        actorId: "user",
        actorName: "User",
      },
    );
    expect(result._unsafeUnwrap().iterationId).toBe("future");
  });
});
