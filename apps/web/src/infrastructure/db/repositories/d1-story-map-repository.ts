import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type {
  StoryMap,
  StoryMapActivity,
  StoryMapCard,
  StoryMapPersona,
  StoryMapSlice,
  StoryMapStructure,
  StoryMapTask,
} from "../../../domain/entities/story-map";
import {
  STORY_MAP_REPOSITORY_ERROR,
  type StoryMapRepository,
  type StoryMapRepositoryError,
} from "../../../domain/repositories/story-map-repository";
import { createDb, type DbClient } from "../client";
import { storiesTable } from "../schema/stories";
import {
  storyMapActivitiesTable,
  storyMapCardsTable,
  storyMapPersonasTable,
  storyMapSlicesTable,
  storyMapsTable,
  storyMapTasksTable,
} from "../schema/story-maps";

type Repo<T> = Promise<Result<T, StoryMapRepositoryError>>;

type OrderedTable =
  | "story_map_personas"
  | "story_map_activities"
  | "story_map_tasks"
  | "story_map_slices"
  | "story_map_cards";

type Scope = { where: string; binds: unknown[] };

const CARD_CELL_SCOPE = (taskId: string, sliceId: string | null): Scope => ({
  where: "task_id = ? AND slice_id IS ?",
  binds: [taskId, sliceId],
});

function toMap(row: typeof storyMapsTable.$inferSelect): StoryMap {
  return {
    __typename: "StoryMap",
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    achievementGoal: row.achievementGoal,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class D1StoryMapRepository implements StoryMapRepository {
  private readonly db: DbClient;
  private readonly d1: D1Database;

  constructor(d1: D1Database) {
    this.d1 = d1;
    this.db = createDb(d1);
  }

  private async guard<T>(run: () => Promise<T>): Repo<T> {
    try {
      return ok(await run());
    } catch {
      return err(STORY_MAP_REPOSITORY_ERROR);
    }
  }

  /**
   * Puts `id` at `index` among the rows of `scope`, renumbering the scope.
   * `table` and `scope.where` are fixed strings from this file, never input.
   */
  private async placeAt(
    table: OrderedTable,
    scope: Scope,
    id: string,
    index: number,
  ): Promise<void> {
    const siblings = await this.d1
      .prepare(
        `SELECT id FROM ${table} WHERE ${scope.where} AND id <> ? ORDER BY position, id`,
      )
      .bind(...scope.binds, id)
      .all<{ id: string }>();
    const ids = siblings.results.map((row) => row.id);
    ids.splice(Math.max(0, Math.min(index, ids.length)), 0, id);
    await this.d1.batch(
      ids.map((rowId, position) =>
        this.d1
          .prepare(`UPDATE ${table} SET position = ? WHERE id = ?`)
          .bind(position, rowId),
      ),
    );
  }

  private touch(mapId: string) {
    return this.d1
      .prepare("UPDATE story_maps SET updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), mapId);
  }

  async listMaps(
    projectId: string,
    includeArchived: boolean,
  ): Repo<StoryMap[]> {
    return this.guard(async () => {
      const rows = await this.db
        .select()
        .from(storyMapsTable)
        .where(
          includeArchived
            ? eq(storyMapsTable.projectId, projectId)
            : and(
                eq(storyMapsTable.projectId, projectId),
                isNull(storyMapsTable.archivedAt),
              ),
        )
        .orderBy(desc(storyMapsTable.createdAt), asc(storyMapsTable.id))
        .all();
      return rows.map(toMap);
    });
  }

  async getStructure(
    projectId: string,
    mapId: string,
  ): Repo<StoryMapStructure | null> {
    return this.guard(async () => {
      const mapRow = await this.db
        .select()
        .from(storyMapsTable)
        .where(
          and(
            eq(storyMapsTable.id, mapId),
            eq(storyMapsTable.projectId, projectId),
          ),
        )
        .get();
      if (!mapRow) {
        return null;
      }
      const [personas, activities, tasks, slices, cards] = await Promise.all([
        this.db
          .select()
          .from(storyMapPersonasTable)
          .where(eq(storyMapPersonasTable.mapId, mapId))
          .orderBy(asc(storyMapPersonasTable.position))
          .all(),
        this.db
          .select()
          .from(storyMapActivitiesTable)
          .where(eq(storyMapActivitiesTable.mapId, mapId))
          .orderBy(asc(storyMapActivitiesTable.position))
          .all(),
        this.db
          .select()
          .from(storyMapTasksTable)
          .where(eq(storyMapTasksTable.mapId, mapId))
          .orderBy(asc(storyMapTasksTable.position))
          .all(),
        this.db
          .select()
          .from(storyMapSlicesTable)
          .where(eq(storyMapSlicesTable.mapId, mapId))
          .orderBy(asc(storyMapSlicesTable.position))
          .all(),
        this.db
          .select({
            card: storyMapCardsTable,
            existingStoryId: storiesTable.id,
          })
          .from(storyMapCardsTable)
          .leftJoin(
            storiesTable,
            and(
              eq(storiesTable.id, storyMapCardsTable.storyId),
              eq(storiesTable.projectId, projectId),
            ),
          )
          .where(eq(storyMapCardsTable.mapId, mapId))
          .orderBy(asc(storyMapCardsTable.position), asc(storyMapCardsTable.id))
          .all(),
      ]);
      return {
        map: toMap(mapRow),
        personas: personas.map(
          ({ id, name, position }): StoryMapPersona => ({ id, name, position }),
        ),
        activities: activities.map(
          ({ id, title, position }): StoryMapActivity => ({
            id,
            title,
            position,
          }),
        ),
        tasks: tasks.map(
          ({ id, activityId, title, position }): StoryMapTask => ({
            id,
            activityId,
            title,
            position,
          }),
        ),
        slices: slices.map(
          ({ id, title, position }): StoryMapSlice => ({ id, title, position }),
        ),
        cards: cards.map(
          ({ card, existingStoryId }): StoryMapCard => ({
            id: card.id,
            taskId: card.taskId,
            sliceId: card.sliceId,
            position: card.position,
            ideaTitle: card.ideaTitle,
            note: card.note,
            storyId: card.storyId,
            storyState:
              card.storyId === null
                ? "idea"
                : existingStoryId
                  ? "linked"
                  : "missing",
          }),
        ),
      };
    });
  }

  async createMap(input: {
    projectId: string;
    title: string;
    achievementGoal: string;
    personaNames: string[];
  }): Repo<StoryMap> {
    return this.guard(async () => {
      const id = ulid();
      const now = new Date().toISOString();
      await this.d1.batch([
        this.d1
          .prepare(
            "INSERT INTO story_maps (id, project_id, title, achievement_goal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(
            id,
            input.projectId,
            input.title,
            input.achievementGoal,
            now,
            now,
          ),
        ...input.personaNames.map((name, position) =>
          this.d1
            .prepare(
              "INSERT INTO story_map_personas (id, map_id, name, position) VALUES (?, ?, ?, ?)",
            )
            .bind(ulid(), id, name, position),
        ),
      ]);
      return {
        __typename: "StoryMap" as const,
        id,
        projectId: input.projectId,
        title: input.title,
        achievementGoal: input.achievementGoal,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
    });
  }

  async updateMap(
    mapId: string,
    patch: { title?: string; achievementGoal?: string; archived?: boolean },
  ): Repo<void> {
    return this.guard(async () => {
      const now = new Date().toISOString();
      const set: Partial<typeof storyMapsTable.$inferInsert> = {
        updatedAt: now,
      };
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.achievementGoal !== undefined)
        set.achievementGoal = patch.achievementGoal;
      if (patch.archived !== undefined)
        set.archivedAt = patch.archived ? now : null;
      await this.db
        .update(storyMapsTable)
        .set(set)
        .where(eq(storyMapsTable.id, mapId));
    });
  }

  async addPersona(mapId: string, name: string): Repo<StoryMapPersona> {
    return this.guard(async () => {
      const id = ulid();
      await this.d1
        .prepare(
          `INSERT INTO story_map_personas (id, map_id, name, position)
           VALUES (?1, ?2, ?3, (SELECT coalesce(max(position), -1) + 1 FROM story_map_personas WHERE map_id = ?2))`,
        )
        .bind(id, mapId, name)
        .run();
      const row = await this.d1
        .prepare("SELECT position FROM story_map_personas WHERE id = ?")
        .bind(id)
        .first<{ position: number }>();
      await this.touch(mapId).run();
      return { id, name, position: row?.position ?? 0 };
    });
  }

  async renamePersona(
    mapId: string,
    personaId: string,
    name: string,
  ): Repo<void> {
    return this.guard(async () => {
      await this.d1.batch([
        this.d1
          .prepare(
            "UPDATE story_map_personas SET name = ? WHERE id = ? AND map_id = ?",
          )
          .bind(name, personaId, mapId),
        this.touch(mapId),
      ]);
    });
  }

  async removePersona(mapId: string, personaId: string): Repo<void> {
    return this.guard(async () => {
      await this.d1.batch([
        this.d1
          .prepare("DELETE FROM story_map_personas WHERE id = ? AND map_id = ?")
          .bind(personaId, mapId),
        this.touch(mapId),
      ]);
    });
  }

  async addActivity(
    mapId: string,
    title: string,
    index: number,
  ): Repo<StoryMapActivity> {
    return this.guard(async () => {
      const id = ulid();
      await this.d1
        .prepare(
          "INSERT INTO story_map_activities (id, map_id, title, position) VALUES (?, ?, ?, 0)",
        )
        .bind(id, mapId, title)
        .run();
      await this.placeAt(
        "story_map_activities",
        { where: "map_id = ?", binds: [mapId] },
        id,
        index,
      );
      await this.touch(mapId).run();
      const row = await this.d1
        .prepare("SELECT position FROM story_map_activities WHERE id = ?")
        .bind(id)
        .first<{ position: number }>();
      return { id, title, position: row?.position ?? 0 };
    });
  }

  async renameActivity(
    mapId: string,
    activityId: string,
    title: string,
  ): Repo<void> {
    return this.guard(async () => {
      await this.d1.batch([
        this.d1
          .prepare(
            "UPDATE story_map_activities SET title = ? WHERE id = ? AND map_id = ?",
          )
          .bind(title, activityId, mapId),
        this.touch(mapId),
      ]);
    });
  }

  async moveActivity(
    mapId: string,
    activityId: string,
    index: number,
  ): Repo<void> {
    return this.guard(async () => {
      await this.placeAt(
        "story_map_activities",
        { where: "map_id = ?", binds: [mapId] },
        activityId,
        index,
      );
      await this.touch(mapId).run();
    });
  }

  async deleteActivity(mapId: string, activityId: string): Repo<void> {
    return this.guard(async () => {
      await this.d1.batch([
        this.d1
          .prepare(
            "DELETE FROM story_map_activities WHERE id = ? AND map_id = ?",
          )
          .bind(activityId, mapId),
        this.touch(mapId),
      ]);
    });
  }

  async addTask(
    mapId: string,
    activityId: string,
    title: string,
    index: number,
  ): Repo<StoryMapTask> {
    return this.guard(async () => {
      const id = ulid();
      await this.d1
        .prepare(
          "INSERT INTO story_map_tasks (id, map_id, activity_id, title, position) VALUES (?, ?, ?, ?, 0)",
        )
        .bind(id, mapId, activityId, title)
        .run();
      await this.placeAt(
        "story_map_tasks",
        { where: "activity_id = ?", binds: [activityId] },
        id,
        index,
      );
      await this.touch(mapId).run();
      const row = await this.d1
        .prepare("SELECT position FROM story_map_tasks WHERE id = ?")
        .bind(id)
        .first<{ position: number }>();
      return { id, activityId, title, position: row?.position ?? 0 };
    });
  }

  async renameTask(mapId: string, taskId: string, title: string): Repo<void> {
    return this.guard(async () => {
      await this.d1.batch([
        this.d1
          .prepare(
            "UPDATE story_map_tasks SET title = ? WHERE id = ? AND map_id = ?",
          )
          .bind(title, taskId, mapId),
        this.touch(mapId),
      ]);
    });
  }

  async moveTask(
    mapId: string,
    taskId: string,
    activityId: string,
    index: number,
  ): Repo<void> {
    return this.guard(async () => {
      await this.d1
        .prepare(
          "UPDATE story_map_tasks SET activity_id = ? WHERE id = ? AND map_id = ?",
        )
        .bind(activityId, taskId, mapId)
        .run();
      await this.placeAt(
        "story_map_tasks",
        { where: "activity_id = ?", binds: [activityId] },
        taskId,
        index,
      );
      await this.touch(mapId).run();
    });
  }

  async deleteTask(mapId: string, taskId: string): Repo<void> {
    return this.guard(async () => {
      await this.d1.batch([
        this.d1
          .prepare("DELETE FROM story_map_tasks WHERE id = ? AND map_id = ?")
          .bind(taskId, mapId),
        this.touch(mapId),
      ]);
    });
  }

  async addSlice(
    mapId: string,
    title: string,
    index: number,
  ): Repo<StoryMapSlice> {
    return this.guard(async () => {
      const id = ulid();
      await this.d1
        .prepare(
          "INSERT INTO story_map_slices (id, map_id, title, position) VALUES (?, ?, ?, 0)",
        )
        .bind(id, mapId, title)
        .run();
      await this.placeAt(
        "story_map_slices",
        { where: "map_id = ?", binds: [mapId] },
        id,
        index,
      );
      await this.touch(mapId).run();
      const row = await this.d1
        .prepare("SELECT position FROM story_map_slices WHERE id = ?")
        .bind(id)
        .first<{ position: number }>();
      return { id, title, position: row?.position ?? 0 };
    });
  }

  async renameSlice(mapId: string, sliceId: string, title: string): Repo<void> {
    return this.guard(async () => {
      await this.d1.batch([
        this.d1
          .prepare(
            "UPDATE story_map_slices SET title = ? WHERE id = ? AND map_id = ?",
          )
          .bind(title, sliceId, mapId),
        this.touch(mapId),
      ]);
    });
  }

  async moveSlice(mapId: string, sliceId: string, index: number): Repo<void> {
    return this.guard(async () => {
      await this.placeAt(
        "story_map_slices",
        { where: "map_id = ?", binds: [mapId] },
        sliceId,
        index,
      );
      await this.touch(mapId).run();
    });
  }

  async deleteSlice(mapId: string, sliceId: string): Repo<void> {
    return this.guard(async () => {
      await this.d1.batch([
        this.d1
          .prepare("DELETE FROM story_map_slices WHERE id = ? AND map_id = ?")
          .bind(sliceId, mapId),
        this.touch(mapId),
      ]);
    });
  }

  async addCard(input: {
    mapId: string;
    taskId: string;
    sliceId: string | null;
    index: number;
    ideaTitle: string | null;
    note: string;
    storyId: string | null;
  }): Repo<StoryMapCard> {
    return this.guard(async () => {
      const id = ulid();
      await this.d1
        .prepare(
          `INSERT INTO story_map_cards (id, map_id, task_id, slice_id, position, idea_title, note, story_id)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
        )
        .bind(
          id,
          input.mapId,
          input.taskId,
          input.sliceId,
          input.ideaTitle,
          input.note,
          input.storyId,
        )
        .run();
      await this.placeAt(
        "story_map_cards",
        CARD_CELL_SCOPE(input.taskId, input.sliceId),
        id,
        input.index,
      );
      await this.touch(input.mapId).run();
      const row = await this.d1
        .prepare("SELECT position FROM story_map_cards WHERE id = ?")
        .bind(id)
        .first<{ position: number }>();
      return {
        id,
        taskId: input.taskId,
        sliceId: input.sliceId,
        position: row?.position ?? 0,
        ideaTitle: input.ideaTitle,
        note: input.note,
        storyId: input.storyId,
        storyState: input.storyId === null ? "idea" : "linked",
      };
    });
  }

  async updateCard(
    mapId: string,
    cardId: string,
    patch: { ideaTitle?: string | null; note?: string },
  ): Repo<void> {
    return this.guard(async () => {
      const set: Partial<typeof storyMapCardsTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (patch.ideaTitle !== undefined) set.ideaTitle = patch.ideaTitle;
      if (patch.note !== undefined) set.note = patch.note;
      await this.db
        .update(storyMapCardsTable)
        .set(set)
        .where(
          and(
            eq(storyMapCardsTable.id, cardId),
            eq(storyMapCardsTable.mapId, mapId),
          ),
        );
      await this.touch(mapId).run();
    });
  }

  async moveCard(
    mapId: string,
    cardId: string,
    to: { taskId: string; sliceId: string | null; index: number },
  ): Repo<void> {
    return this.guard(async () => {
      await this.d1
        .prepare(
          "UPDATE story_map_cards SET task_id = ?, slice_id = ?, updated_at = ? WHERE id = ? AND map_id = ?",
        )
        .bind(to.taskId, to.sliceId, new Date().toISOString(), cardId, mapId)
        .run();
      await this.placeAt(
        "story_map_cards",
        CARD_CELL_SCOPE(to.taskId, to.sliceId),
        cardId,
        to.index,
      );
      await this.touch(mapId).run();
    });
  }

  async setCardStory(
    mapId: string,
    cardId: string,
    storyId: string | null,
  ): Repo<void> {
    return this.guard(async () => {
      await this.d1.batch([
        this.d1
          .prepare(
            "UPDATE story_map_cards SET story_id = ?, updated_at = ? WHERE id = ? AND map_id = ?",
          )
          .bind(storyId, new Date().toISOString(), cardId, mapId),
        this.touch(mapId),
      ]);
    });
  }

  async deleteCard(mapId: string, cardId: string): Repo<void> {
    return this.guard(async () => {
      await this.d1.batch([
        this.d1
          .prepare("DELETE FROM story_map_cards WHERE id = ? AND map_id = ?")
          .bind(cardId, mapId),
        this.touch(mapId),
      ]);
    });
  }

  async storyExistsInProject(
    projectId: string,
    storyId: string,
  ): Repo<boolean> {
    return this.guard(async () => {
      const row = await this.db
        .select({ id: storiesTable.id })
        .from(storiesTable)
        .where(
          and(
            eq(storiesTable.id, storyId),
            eq(storiesTable.projectId, projectId),
          ),
        )
        .get();
      return row !== undefined;
    });
  }
}
