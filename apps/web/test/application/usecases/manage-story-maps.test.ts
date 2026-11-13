import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addActivity,
  addCard,
  addSlice,
  addTask,
  createStoryFromCard,
  createStoryMap,
  deleteSlice,
  getStoryMap,
  INVALID_STORY_MAP_INPUT_ERROR,
  listStoryMaps,
  moveCard,
  moveSlice,
  moveTask,
  searchStoriesForCard,
  setCardStory,
  STORY_MAP_ARCHIVED_ERROR,
  STORY_MAP_ELEMENT_NOT_FOUND_ERROR,
  STORY_MAP_FORBIDDEN_ERROR,
  STORY_MAP_NOT_FOUND_ERROR,
  STORY_MAP_STORY_ALREADY_PLACED_ERROR,
  STORY_MAP_STORY_NOT_FOUND_ERROR,
  type StoryMapDependencies,
  updateStoryMap,
} from "../../../src/application/usecases/manage-story-maps";
import { createDb } from "../../../src/infrastructure/db/client";
import { D1ProjectRepository } from "../../../src/infrastructure/db/repositories/d1-project-repository";
import { D1StoryMapRepository } from "../../../src/infrastructure/db/repositories/d1-story-map-repository";
import { projectMembersTable } from "../../../src/infrastructure/db/schema/project-members";
import { projectsTable } from "../../../src/infrastructure/db/schema/projects";
import { storiesTable } from "../../../src/infrastructure/db/schema/stories";
import { usersTable } from "../../../src/infrastructure/db/schema/users";
import { resetDatabase } from "../../helpers/db";

const P1 = "01JNMVQ8Q9Y6P5KH1XZ4V7C2P1";
const P2 = "01JNMVQ8Q9Y6P5KH1XZ4V7C2P2";
const OWNER = "u-owner";
const MEMBER = "u-member";
const VIEWER = "u-viewer";
const OUTSIDER = "u-outsider";

let deps: StoryMapDependencies;

const as = (userId: string, projectId = P1) => ({ userId, projectId });

async function insertStory(id: string, projectId: string, number: number) {
  await createDb(env.DB).insert(storiesTable).values({
    id,
    storyNumber: number,
    projectId,
    title: id,
    description: "-",
    type: "feature",
    status: "Started",
    storyPoint: 3,
    isIcebox: 0,
    position: number,
  });
}

async function setup() {
  const map = (
    await createStoryMap(deps, {
      ...as(OWNER),
      title: "Map",
    })
  )._unsafeUnwrap();
  const target = { ...as(OWNER), mapId: map.id };
  const activity = (
    await addActivity(deps, { ...target, title: "A" })
  )._unsafeUnwrap();
  const task = (
    await addTask(deps, { ...target, activityId: activity.id, title: "T" })
  )._unsafeUnwrap();
  const slice = (
    await addSlice(deps, { ...target, title: "Release 1" })
  )._unsafeUnwrap();
  return { map, target, activity, task, slice };
}

describe("manage story maps", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    const db = createDb(env.DB);
    await db.insert(usersTable).values(
      [OWNER, MEMBER, VIEWER, OUTSIDER].map((id) => ({
        id,
        displayName: id,
        email: `${id}@example.com`,
      })),
    );
    await db.insert(projectsTable).values([
      { id: P1, name: "One" },
      { id: P2, name: "Two" },
    ]);
    await db.insert(projectMembersTable).values([
      { projectId: P1, userId: OWNER, role: "owner" },
      { projectId: P1, userId: MEMBER, role: "member" },
      { projectId: P1, userId: VIEWER, role: "viewer" },
      { projectId: P2, userId: OUTSIDER, role: "owner" },
    ]);
    deps = {
      storyMapRepository: new D1StoryMapRepository(env.DB),
      projectRepository: new D1ProjectRepository(env.DB),
    };
  });

  it("keeps a free-text goal on the map", async () => {
    const { map } = await setup();
    const structure = (
      await getStoryMap(deps, { ...as(VIEWER), mapId: map.id })
    )._unsafeUnwrap();
    const updated = await updateStoryMap(deps, {
      ...as(MEMBER),
      mapId: map.id,
      achievementGoal: "  Plan the week  ",
    });
    expect(updated.isOk()).toBe(true);
    const again = (
      await getStoryMap(deps, { ...as(MEMBER), mapId: map.id })
    )._unsafeUnwrap();
    expect(again.map.achievementGoal).toBe("Plan the week");
  });

  it("rejects edits from viewers and non-members, and hides maps of other projects", async () => {
    const { map, activity } = await setup();
    const edit = { mapId: map.id, activityId: activity.id, title: "x" };
    expect(
      (await addTask(deps, { ...as(VIEWER), ...edit }))._unsafeUnwrapErr(),
    ).toBe(STORY_MAP_FORBIDDEN_ERROR);
    expect(
      (await addTask(deps, { ...as(OUTSIDER), ...edit }))._unsafeUnwrapErr(),
    ).toBe(STORY_MAP_FORBIDDEN_ERROR);
    expect(
      (
        await createStoryMap(deps, { ...as(VIEWER), title: "x" })
      )._unsafeUnwrapErr(),
    ).toBe(STORY_MAP_FORBIDDEN_ERROR);
    expect((await listStoryMaps(deps, as(OUTSIDER)))._unsafeUnwrapErr()).toBe(
      STORY_MAP_FORBIDDEN_ERROR,
    );
    expect(
      (
        await getStoryMap(deps, { ...as(OUTSIDER, P2), mapId: map.id })
      )._unsafeUnwrapErr(),
    ).toBe(STORY_MAP_NOT_FOUND_ERROR);
    expect(
      (
        await getStoryMap(deps, { ...as(OUTSIDER, P1), mapId: map.id })
      )._unsafeUnwrapErr(),
    ).toBe(STORY_MAP_FORBIDDEN_ERROR);
    expect((await listStoryMaps(deps, as(VIEWER))).isOk()).toBe(true);
  });

  it("refuses elements that belong to another map", async () => {
    const a = await setup();
    const b = (
      await createStoryMap(deps, { ...as(OWNER), title: "Other" })
    )._unsafeUnwrap();
    const otherTarget = { ...as(OWNER), mapId: b.id };
    const otherActivity = (
      await addActivity(deps, { ...otherTarget, title: "B" })
    )._unsafeUnwrap();
    const otherTask = (
      await addTask(deps, {
        ...otherTarget,
        activityId: otherActivity.id,
        title: "BT",
      })
    )._unsafeUnwrap();

    expect(
      (
        await addTask(deps, {
          ...a.target,
          activityId: otherActivity.id,
          title: "x",
        })
      )._unsafeUnwrapErr(),
    ).toBe(STORY_MAP_ELEMENT_NOT_FOUND_ERROR);
    expect(
      (
        await addCard(deps, {
          ...a.target,
          taskId: otherTask.id,
          ideaTitle: "x",
        })
      )._unsafeUnwrapErr(),
    ).toBe(STORY_MAP_ELEMENT_NOT_FOUND_ERROR);
    expect(
      (
        await addCard(deps, {
          ...a.target,
          taskId: a.task.id,
          sliceId: "nope",
          ideaTitle: "x",
        })
      )._unsafeUnwrapErr(),
    ).toBe(STORY_MAP_ELEMENT_NOT_FOUND_ERROR);
  });

  it("allows a story only in its own project and once per map", async () => {
    const { target, task, map } = await setup();
    await insertStory("s1", P1, 1);
    await insertStory("sx", P2, 1);

    expect(
      (
        await addCard(deps, { ...target, taskId: task.id, storyId: "sx" })
      )._unsafeUnwrapErr(),
    ).toBe(STORY_MAP_STORY_NOT_FOUND_ERROR);

    const card = (
      await addCard(deps, { ...target, taskId: task.id, storyId: "s1" })
    )._unsafeUnwrap();
    expect(card.storyState).toBe("linked");
    expect(
      (
        await addCard(deps, { ...target, taskId: task.id, storyId: "s1" })
      )._unsafeUnwrapErr(),
    ).toBe(STORY_MAP_STORY_ALREADY_PLACED_ERROR);

    const second = (
      await createStoryMap(deps, { ...as(OWNER), title: "Second" })
    )._unsafeUnwrap();
    const secondTarget = { ...as(OWNER), mapId: second.id };
    const activity = (
      await addActivity(deps, { ...secondTarget, title: "A" })
    )._unsafeUnwrap();
    const secondTask = (
      await addTask(deps, {
        ...secondTarget,
        activityId: activity.id,
        title: "T",
      })
    )._unsafeUnwrap();
    expect(
      (
        await addCard(deps, {
          ...secondTarget,
          taskId: secondTask.id,
          storyId: "s1",
        })
      ).isOk(),
    ).toBe(true);
    expect(map.id).not.toBe(second.id);
  });

  it("turns a card of a deleted story into missing, not an idea", async () => {
    const { target, task, map } = await setup();
    await insertStory("s1", P1, 1);
    await addCard(deps, { ...target, taskId: task.id, storyId: "s1" });
    await addCard(deps, { ...target, taskId: task.id, ideaTitle: "Idea" });
    await createDb(env.DB)
      .delete(storiesTable)
      .where(eq(storiesTable.id, "s1"));

    const { cards } = (
      await getStoryMap(deps, { ...target, mapId: map.id })
    )._unsafeUnwrap();
    expect(cards.map((c) => c.storyState).sort()).toEqual(["idea", "missing"]);
    expect(
      (
        await setCardStory(deps, {
          ...target,
          cardId: cards.find((c) => c.storyState === "missing")?.id ?? "",
          storyId: null,
        })
      )._unsafeUnwrapErr(),
    ).toBe(INVALID_STORY_MAP_INPUT_ERROR);
  });

  it("requires a title for an idea card", async () => {
    const { target, task } = await setup();
    expect(
      (
        await addCard(deps, { ...target, taskId: task.id, ideaTitle: "  " })
      )._unsafeUnwrapErr(),
    ).toBe(INVALID_STORY_MAP_INPUT_ERROR);
  });

  it("moves cards without changing the story's development attributes", async () => {
    const { target, task, slice, map } = await setup();
    await insertStory("s1", P1, 1);
    const db = createDb(env.DB);
    const before = await db
      .select()
      .from(storiesTable)
      .where(eq(storiesTable.id, "s1"))
      .get();
    const card = (
      await addCard(deps, { ...target, taskId: task.id, storyId: "s1" })
    )._unsafeUnwrap();
    const moved = await moveCard(deps, {
      ...target,
      cardId: card.id,
      taskId: task.id,
      sliceId: slice.id,
      index: 0,
    });
    expect(moved.isOk()).toBe(true);
    await deleteSlice(deps, { ...target, sliceId: slice.id });

    const after = await db
      .select()
      .from(storiesTable)
      .where(eq(storiesTable.id, "s1"))
      .get();
    expect(after).toEqual(before);
    const { cards } = (
      await getStoryMap(deps, { ...target, mapId: map.id })
    )._unsafeUnwrap();
    expect(cards[0]?.sliceId).toBeNull();
  });

  it("keeps order when inserting and moving tasks, slices and cards", async () => {
    const { target, activity, task, map } = await setup();
    const second = (
      await addTask(deps, {
        ...target,
        activityId: activity.id,
        title: "T2",
        index: 0,
      })
    )._unsafeUnwrap();
    const otherActivity = (
      await addActivity(deps, { ...target, title: "A2", index: 0 })
    )._unsafeUnwrap();
    await moveTask(deps, {
      ...target,
      taskId: task.id,
      activityId: otherActivity.id,
      index: 0,
    });
    const s2 = (
      await addSlice(deps, { ...target, title: "R2", index: 0 })
    )._unsafeUnwrap();
    await moveSlice(deps, { ...target, sliceId: s2.id, index: 5 });
    const c1 = (
      await addCard(deps, { ...target, taskId: second.id, ideaTitle: "c1" })
    )._unsafeUnwrap();
    const c2 = (
      await addCard(deps, {
        ...target,
        taskId: second.id,
        ideaTitle: "c2",
        index: 0,
      })
    )._unsafeUnwrap();

    const s = (
      await getStoryMap(deps, { ...target, mapId: map.id })
    )._unsafeUnwrap();
    expect(s.activities.map((a) => a.title)).toEqual(["A2", "A"]);
    expect(
      s.tasks
        .filter((t) => t.activityId === otherActivity.id)
        .map((t) => t.title),
    ).toEqual(["T"]);
    expect(s.slices.map((x) => x.title)).toEqual(["Release 1", "R2"]);
    expect(s.cards.map((c) => c.id)).toEqual([c2.id, c1.id]);
  });

  it("appends the cards of a deleted slice after the unplanned cards", async () => {
    const { target, task, slice, map } = await setup();
    const planned = (
      await addCard(deps, {
        ...target,
        taskId: task.id,
        sliceId: slice.id,
        ideaTitle: "planned",
      })
    )._unsafeUnwrap();
    const first = (
      await addCard(deps, { ...target, taskId: task.id, ideaTitle: "u1" })
    )._unsafeUnwrap();
    const second = (
      await addCard(deps, { ...target, taskId: task.id, ideaTitle: "u2" })
    )._unsafeUnwrap();
    await deleteSlice(deps, { ...target, sliceId: slice.id });

    const { cards } = (
      await getStoryMap(deps, { ...target, mapId: map.id })
    )._unsafeUnwrap();
    expect(cards.map((c) => c.id)).toEqual([first.id, second.id, planned.id]);
    expect(cards.map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it("refuses edits on an archived map until it is restored", async () => {
    const { target, activity } = await setup();
    await updateStoryMap(deps, { ...target, archived: true });
    expect(
      (
        await addTask(deps, { ...target, activityId: activity.id, title: "x" })
      )._unsafeUnwrapErr(),
    ).toBe(STORY_MAP_ARCHIVED_ERROR);
    expect((await listStoryMaps(deps, as(OWNER)))._unsafeUnwrap()).toHaveLength(
      0,
    );
    expect(
      (
        await listStoryMaps(deps, { ...as(OWNER), includeArchived: true })
      )._unsafeUnwrap(),
    ).toHaveLength(1);
    expect(
      (await updateStoryMap(deps, { ...target, archived: false })).isOk(),
    ).toBe(true);
    expect(
      (
        await addTask(deps, { ...target, activityId: activity.id, title: "x" })
      ).isOk(),
    ).toBe(true);
  });
  describe("linking cards to stories", () => {
    async function ideaCard() {
      const ctx = await setup();
      const card = (
        await addCard(deps, {
          ...ctx.target,
          taskId: ctx.task.id,
          ideaTitle: "Idea",
        })
      )._unsafeUnwrap();
      return { ...ctx, card };
    }

    it("creates an Unstarted story, links the card and writes only that story", async () => {
      const { target, card, map } = await ideaCard();
      await insertStory("s1", P1, 1);
      const db = createDb(env.DB);
      const before = await db
        .select()
        .from(storiesTable)
        .where(eq(storiesTable.id, "s1"))
        .get();

      const created = (
        await createStoryFromCard(deps, {
          ...target,
          cardId: card.id,
          title: "  From idea ",
          description: "memo",
          type: "bug",
          isIcebox: true,
        })
      )._unsafeUnwrap();
      expect(created.storyNumber).toBe(2);

      const story = await db
        .select()
        .from(storiesTable)
        .where(eq(storiesTable.id, created.storyId))
        .get();
      expect(story).toMatchObject({
        title: "From idea",
        description: "memo",
        type: "bug",
        status: "Unstarted",
        isIcebox: 1,
        iterationId: null,
      });
      const after = await db
        .select()
        .from(storiesTable)
        .where(eq(storiesTable.id, "s1"))
        .get();
      expect(after?.status).toBe(before?.status);
      expect(after?.isIcebox).toBe(before?.isIcebox);
      expect(after?.iterationId).toBe(before?.iterationId);

      const linked = (
        await getStoryMap(deps, { ...target, mapId: map.id })
      )._unsafeUnwrap().cards[0];
      expect(linked?.storyState).toBe("linked");
      expect(linked?.story).toMatchObject({
        number: 2,
        title: "From idea",
        status: "Unstarted",
        isIcebox: true,
      });
    });

    it("never creates a second story for a card that is already linked", async () => {
      const { target, card } = await ideaCard();
      const input = {
        ...target,
        cardId: card.id,
        title: "Once",
        description: "",
        type: "feature",
        isIcebox: false,
      };
      expect((await createStoryFromCard(deps, input)).isOk()).toBe(true);
      expect((await createStoryFromCard(deps, input))._unsafeUnwrapErr()).toBe(
        STORY_MAP_STORY_ALREADY_PLACED_ERROR,
      );
      const rows = await createDb(env.DB).select().from(storiesTable);
      expect(rows).toHaveLength(1);
    });

    it("records the op and advances seq in the same batch as the story", async () => {
      const { target, card, map } = await ideaCard();
      const opId = "01JNMVQ8Q9Y6P5KH1XZ4V7C2OP";
      const bound = {
        ...deps,
        storyMapRepository: new D1StoryMapRepository(env.DB, {
          opId,
          userId: OWNER,
        }),
      };
      const created = (
        await createStoryFromCard(bound, {
          ...target,
          cardId: card.id,
          title: "Atomic",
          description: "",
          type: "feature",
          isIcebox: false,
        })
      )._unsafeUnwrap();
      const repository = new D1StoryMapRepository(env.DB);
      const recorded = (await repository.findOp(map.id, opId))._unsafeUnwrap();
      expect(recorded).toMatchObject({ userId: OWNER, seq: 1 });
      expect(JSON.parse(recorded?.result ?? "null")).toEqual(created);
      expect((await repository.getSeq(map.id))._unsafeUnwrap()).toBe(1);
    });

    it("records every other write with its op in the same batch, so a retry finds it", async () => {
      const { target, card, map, task } = await ideaCard();
      const repository = new D1StoryMapRepository(env.DB);
      const bind = (opId: string) => ({
        ...deps,
        storyMapRepository: new D1StoryMapRepository(env.DB, {
          opId,
          userId: OWNER,
        }),
      });
      const addOp = "01JNMVQ8Q9Y6P5KH1XZ4V7C2A1";
      const added = (
        await addCard(bind(addOp), {
          ...target,
          taskId: task.id,
          ideaTitle: "Second",
          index: 0,
        })
      )._unsafeUnwrap();
      const recordedAdd = (
        await repository.findOp(map.id, addOp)
      )._unsafeUnwrap();
      expect(recordedAdd).toMatchObject({ userId: OWNER, seq: 1 });
      expect(JSON.parse(recordedAdd?.result ?? "null")).toEqual(added);

      const moveOp = "01JNMVQ8Q9Y6P5KH1XZ4V7C2A2";
      await moveCard(bind(moveOp), {
        ...target,
        cardId: card.id,
        taskId: task.id,
        sliceId: null,
        index: 0,
      });
      expect(
        (await repository.findOp(map.id, moveOp))._unsafeUnwrap(),
      ).toMatchObject({ seq: 2, result: "null" });
      expect((await repository.getSeq(map.id))._unsafeUnwrap()).toBe(2);
    });

    it("commits neither the effect nor the op when the batch fails", async () => {
      const { target, task, map } = await ideaCard();
      const repository = new D1StoryMapRepository(env.DB);
      const opId = "01JNMVQ8Q9Y6P5KH1XZ4V7C2A3";
      const bound = new D1StoryMapRepository(env.DB, { opId, userId: OWNER });
      await bound.addCard({
        mapId: map.id,
        taskId: task.id,
        sliceId: null,
        index: 0,
        ideaTitle: "Once",
        note: "",
        storyId: null,
      });
      const replay = await bound.addCard({
        mapId: map.id,
        taskId: task.id,
        sliceId: null,
        index: 0,
        ideaTitle: "Twice",
        note: "",
        storyId: null,
      });
      expect(replay.isErr()).toBe(true);
      const structure = (
        await repository.getStructure(target.projectId, map.id)
      )._unsafeUnwrap();
      expect(
        structure?.cards.filter((card) => card.ideaTitle === "Twice"),
      ).toHaveLength(0);
      expect((await repository.getSeq(map.id))._unsafeUnwrap()).toBe(1);
    });

    it("rejects invalid titles and types, and viewers", async () => {
      const { target, card, map } = await ideaCard();
      const base = {
        cardId: card.id,
        title: "T",
        description: "",
        type: "feature",
        isIcebox: false,
      };
      expect(
        (
          await createStoryFromCard(deps, { ...target, ...base, title: " " })
        )._unsafeUnwrapErr(),
      ).toBe(INVALID_STORY_MAP_INPUT_ERROR);
      expect(
        (
          await createStoryFromCard(deps, {
            ...target,
            ...base,
            type: "release",
          })
        )._unsafeUnwrapErr(),
      ).toBe(INVALID_STORY_MAP_INPUT_ERROR);
      expect(
        (
          await createStoryFromCard(deps, {
            ...as(VIEWER),
            mapId: map.id,
            ...base,
          })
        )._unsafeUnwrapErr(),
      ).toBe(STORY_MAP_FORBIDDEN_ERROR);
    });

    it("finds stories by number or title and flags the ones already placed", async () => {
      const { target, task } = await setup();
      await insertStory("s1", P1, 1);
      await insertStory("s2", P1, 2);
      await insertStory("x1", P2, 1);
      await addCard(deps, { ...target, taskId: task.id, storyId: "s1" });

      const byNumber = (
        await searchStoriesForCard(deps, { ...target, query: "#2" })
      )._unsafeUnwrap();
      expect(byNumber.map((s) => s.id)).toEqual(["s2"]);
      const all = (
        await searchStoriesForCard(deps, { ...target, query: "s" })
      )._unsafeUnwrap();
      expect(all.map((s) => [s.id, s.placed])).toEqual([
        ["s2", false],
        ["s1", true],
      ]);
      expect(
        (
          await searchStoriesForCard(deps, {
            ...as(VIEWER),
            mapId: target.mapId,
            query: "",
          })
        )._unsafeUnwrapErr(),
      ).toBe(STORY_MAP_FORBIDDEN_ERROR);
    });

    it("lets a card whose story was deleted be linked to another story", async () => {
      const { target, task, map } = await setup();
      await insertStory("s1", P1, 1);
      await insertStory("s2", P1, 2);
      const card = (
        await addCard(deps, { ...target, taskId: task.id, storyId: "s1" })
      )._unsafeUnwrap();
      await createDb(env.DB)
        .delete(storiesTable)
        .where(eq(storiesTable.id, "s1"));
      const missing = (
        await getStoryMap(deps, { ...target, mapId: map.id })
      )._unsafeUnwrap().cards[0];
      expect(missing).toMatchObject({ storyState: "missing", story: null });

      expect(
        (
          await setCardStory(deps, {
            ...target,
            cardId: card.id,
            storyId: "s2",
          })
        ).isOk(),
      ).toBe(true);
      const relinked = (
        await getStoryMap(deps, { ...target, mapId: map.id })
      )._unsafeUnwrap().cards[0];
      expect(relinked?.story?.number).toBe(2);
    });
  });
});
