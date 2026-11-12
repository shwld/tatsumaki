import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type {
  StoryMap,
  StoryMapActivity,
  StoryMapCard,
  StoryMapLinkedStory,
  StoryMapPersona,
  StoryMapSlice,
  StoryMapStructure,
  StoryMapTask,
} from "../../../domain/entities/story-map";
import {
  STORY_MAP_REPOSITORY_ERROR,
  type StoryMapRecordedOp,
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

export type StoryMapOpContext = { opId: string; userId: string };

export class D1StoryMapRepository implements StoryMapRepository {
  private readonly db: DbClient;
  private readonly d1: D1Database;

  /**
   * With `op`, every write also advances `seq` and records the op inside its
   * own batch, so an effect can never be committed without its op (ADR-0014 §2).
   */
  constructor(
    d1: D1Database,
    private readonly op?: StoryMapOpContext,
  ) {
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
   * Statements that put `id` at `index` among the rows of `scope`, renumbering
   * the scope. `table` and `scope.where` are fixed strings from this file,
   * never input. The caller runs them after any statement that inserts or moves
   * `id`, in one batch.
   */
  private async planPlacement(
    table: OrderedTable,
    scope: Scope,
    id: string,
    index: number,
  ): Promise<{ statements: D1PreparedStatement[]; position: number }> {
    const siblings = await this.d1
      .prepare(
        `SELECT id FROM ${table} WHERE ${scope.where} AND id <> ? ORDER BY position, id`,
      )
      .bind(...scope.binds, id)
      .all<{ id: string }>();
    const ids = siblings.results.map((row) => row.id);
    const position = Math.max(0, Math.min(index, ids.length));
    ids.splice(position, 0, id);
    return {
      position,
      statements: ids.map((rowId, at) =>
        this.d1
          .prepare(`UPDATE ${table} SET position = ? WHERE id = ?`)
          .bind(at, rowId),
      ),
    };
  }

  private opStatements(
    mapId: string,
    result: string,
    now: string,
  ): D1PreparedStatement[] {
    if (!this.op) return [];
    return [
      this.d1
        .prepare(
          "UPDATE story_maps SET seq = seq + 1, updated_at = ? WHERE id = ?",
        )
        .bind(now, mapId),
      this.d1
        .prepare(
          `INSERT INTO story_map_ops (map_id, op_id, user_id, seq, result, created_at)
           SELECT id, ?, ?, seq, ?, ? FROM story_maps WHERE id = ?`,
        )
        .bind(this.op.opId, this.op.userId, result, now, mapId),
    ];
  }

  /** Runs `statements` with the map's `updated_at` bump and op record as one batch. */
  private async commit(
    mapId: string,
    statements: D1PreparedStatement[],
    result: unknown = null,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.d1.batch([
      ...statements,
      this.touch(mapId),
      ...this.opStatements(mapId, JSON.stringify(result ?? null), now),
    ]);
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
            storyNumber: storiesTable.storyNumber,
            storyTitle: storiesTable.title,
            storyStatus: storiesTable.status,
            storyType: storiesTable.type,
            storyPoint: storiesTable.storyPoint,
            storyIsIcebox: storiesTable.isIcebox,
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
          ({ id, name, position }): StoryMapPersona => ({
            id,
            name,
            position,
          }),
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
          ({ id, title, position }): StoryMapSlice => ({
            id,
            title,
            position,
          }),
        ),
        cards: cards.map(
          ({
            card,
            existingStoryId,
            storyNumber,
            storyTitle,
            storyStatus,
            storyType,
            storyPoint,
            storyIsIcebox,
          }): StoryMapCard => ({
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
            story:
              existingStoryId &&
              storyNumber !== null &&
              storyTitle !== null &&
              storyStatus !== null &&
              storyType !== null
                ? {
                    number: storyNumber,
                    title: storyTitle,
                    status: storyStatus,
                    type: storyType,
                    storyPoint,
                    isIcebox: storyIsIcebox === 1,
                  }
                : null,
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
      const update = this.db
        .update(storyMapsTable)
        .set(set)
        .where(eq(storyMapsTable.id, mapId))
        .toSQL();
      await this.commit(mapId, [
        this.d1.prepare(update.sql).bind(...update.params),
      ]);
    });
  }

  async addPersona(mapId: string, name: string): Repo<StoryMapPersona> {
    return this.guard(async () => {
      const id = ulid();
      const next = await this.d1
        .prepare(
          "SELECT coalesce(max(position), -1) + 1 AS position FROM story_map_personas WHERE map_id = ?",
        )
        .bind(mapId)
        .first<{ position: number }>();
      const position = next?.position ?? 0;
      const persona = { id, name, position };
      await this.commit(
        mapId,
        [
          this.d1
            .prepare(
              "INSERT INTO story_map_personas (id, map_id, name, position) VALUES (?, ?, ?, ?)",
            )
            .bind(id, mapId, name, position),
        ],
        persona,
      );
      return persona;
    });
  }

  async renamePersona(
    mapId: string,
    personaId: string,
    name: string,
  ): Repo<void> {
    return this.guard(async () => {
      await this.commit(mapId, [
        this.d1
          .prepare(
            "UPDATE story_map_personas SET name = ? WHERE id = ? AND map_id = ?",
          )
          .bind(name, personaId, mapId),
      ]);
    });
  }

  async removePersona(mapId: string, personaId: string): Repo<void> {
    return this.guard(async () => {
      await this.commit(mapId, [
        this.d1
          .prepare("DELETE FROM story_map_personas WHERE id = ? AND map_id = ?")
          .bind(personaId, mapId),
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
      const placement = await this.planPlacement(
        "story_map_activities",
        { where: "map_id = ?", binds: [mapId] },
        id,
        index,
      );
      const activity = { id, title, position: placement.position };
      await this.commit(
        mapId,
        [
          this.d1
            .prepare(
              "INSERT INTO story_map_activities (id, map_id, title, position) VALUES (?, ?, ?, 0)",
            )
            .bind(id, mapId, title),
          ...placement.statements,
        ],
        activity,
      );
      return activity;
    });
  }

  async renameActivity(
    mapId: string,
    activityId: string,
    title: string,
  ): Repo<void> {
    return this.guard(async () => {
      await this.commit(mapId, [
        this.d1
          .prepare(
            "UPDATE story_map_activities SET title = ? WHERE id = ? AND map_id = ?",
          )
          .bind(title, activityId, mapId),
      ]);
    });
  }

  async moveActivity(
    mapId: string,
    activityId: string,
    index: number,
  ): Repo<void> {
    return this.guard(async () => {
      const placement = await this.planPlacement(
        "story_map_activities",
        { where: "map_id = ?", binds: [mapId] },
        activityId,
        index,
      );
      await this.commit(mapId, placement.statements);
    });
  }

  async deleteActivity(mapId: string, activityId: string): Repo<void> {
    return this.guard(async () => {
      await this.commit(mapId, [
        this.d1
          .prepare(
            "DELETE FROM story_map_activities WHERE id = ? AND map_id = ?",
          )
          .bind(activityId, mapId),
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
      const placement = await this.planPlacement(
        "story_map_tasks",
        { where: "activity_id = ?", binds: [activityId] },
        id,
        index,
      );
      const task = { id, activityId, title, position: placement.position };
      await this.commit(
        mapId,
        [
          this.d1
            .prepare(
              "INSERT INTO story_map_tasks (id, map_id, activity_id, title, position) VALUES (?, ?, ?, ?, 0)",
            )
            .bind(id, mapId, activityId, title),
          ...placement.statements,
        ],
        task,
      );
      return task;
    });
  }

  async renameTask(mapId: string, taskId: string, title: string): Repo<void> {
    return this.guard(async () => {
      await this.commit(mapId, [
        this.d1
          .prepare(
            "UPDATE story_map_tasks SET title = ? WHERE id = ? AND map_id = ?",
          )
          .bind(title, taskId, mapId),
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
      const placement = await this.planPlacement(
        "story_map_tasks",
        { where: "activity_id = ?", binds: [activityId] },
        taskId,
        index,
      );
      await this.commit(mapId, [
        this.d1
          .prepare(
            "UPDATE story_map_tasks SET activity_id = ? WHERE id = ? AND map_id = ?",
          )
          .bind(activityId, taskId, mapId),
        ...placement.statements,
      ]);
    });
  }

  async deleteTask(mapId: string, taskId: string): Repo<void> {
    return this.guard(async () => {
      await this.commit(mapId, [
        this.d1
          .prepare("DELETE FROM story_map_tasks WHERE id = ? AND map_id = ?")
          .bind(taskId, mapId),
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
      const placement = await this.planPlacement(
        "story_map_slices",
        { where: "map_id = ?", binds: [mapId] },
        id,
        index,
      );
      const slice = { id, title, position: placement.position };
      await this.commit(
        mapId,
        [
          this.d1
            .prepare(
              "INSERT INTO story_map_slices (id, map_id, title, position) VALUES (?, ?, ?, 0)",
            )
            .bind(id, mapId, title),
          ...placement.statements,
        ],
        slice,
      );
      return slice;
    });
  }

  async renameSlice(mapId: string, sliceId: string, title: string): Repo<void> {
    return this.guard(async () => {
      await this.commit(mapId, [
        this.d1
          .prepare(
            "UPDATE story_map_slices SET title = ? WHERE id = ? AND map_id = ?",
          )
          .bind(title, sliceId, mapId),
      ]);
    });
  }

  async moveSlice(mapId: string, sliceId: string, index: number): Repo<void> {
    return this.guard(async () => {
      const placement = await this.planPlacement(
        "story_map_slices",
        { where: "map_id = ?", binds: [mapId] },
        sliceId,
        index,
      );
      await this.commit(mapId, placement.statements);
    });
  }

  async deleteSlice(mapId: string, sliceId: string): Repo<void> {
    return this.guard(async () => {
      const moving = await this.d1
        .prepare(
          "SELECT id, task_id FROM story_map_cards WHERE map_id = ? AND slice_id = ? ORDER BY position, id",
        )
        .bind(mapId, sliceId)
        .all<{ id: string; task_id: string }>();
      const taskIds = [...new Set(moving.results.map((row) => row.task_id))];
      const renumber: D1PreparedStatement[] = [];
      for (const taskId of taskIds) {
        const unplanned = await this.d1
          .prepare(
            "SELECT id FROM story_map_cards WHERE task_id = ? AND slice_id IS NULL ORDER BY position, id",
          )
          .bind(taskId)
          .all<{ id: string }>();
        const ids = [
          ...unplanned.results.map((row) => row.id),
          ...moving.results
            .filter((row) => row.task_id === taskId)
            .map((row) => row.id),
        ];
        ids.forEach((id, position) => {
          renumber.push(
            this.d1
              .prepare(
                "UPDATE story_map_cards SET slice_id = NULL, position = ? WHERE id = ?",
              )
              .bind(position, id),
          );
        });
      }
      await this.commit(mapId, [
        ...renumber,
        this.d1
          .prepare("DELETE FROM story_map_slices WHERE id = ? AND map_id = ?")
          .bind(sliceId, mapId),
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
      const placement = await this.planPlacement(
        "story_map_cards",
        CARD_CELL_SCOPE(input.taskId, input.sliceId),
        id,
        input.index,
      );
      const card: StoryMapCard = {
        id,
        taskId: input.taskId,
        sliceId: input.sliceId,
        position: placement.position,
        ideaTitle: input.ideaTitle,
        note: input.note,
        storyId: input.storyId,
        storyState: input.storyId === null ? "idea" : "linked",
        story: null,
      };
      await this.commit(
        input.mapId,
        [
          this.d1
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
            ),
          ...placement.statements,
        ],
        card,
      );
      return card;
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
      const update = this.db
        .update(storyMapCardsTable)
        .set(set)
        .where(
          and(
            eq(storyMapCardsTable.id, cardId),
            eq(storyMapCardsTable.mapId, mapId),
          ),
        )
        .toSQL();
      await this.commit(mapId, [
        this.d1.prepare(update.sql).bind(...update.params),
      ]);
    });
  }

  async moveCard(
    mapId: string,
    cardId: string,
    to: { taskId: string; sliceId: string | null; index: number },
  ): Repo<void> {
    return this.guard(async () => {
      const placement = await this.planPlacement(
        "story_map_cards",
        CARD_CELL_SCOPE(to.taskId, to.sliceId),
        cardId,
        to.index,
      );
      await this.commit(mapId, [
        this.d1
          .prepare(
            "UPDATE story_map_cards SET task_id = ?, slice_id = ?, updated_at = ? WHERE id = ? AND map_id = ?",
          )
          .bind(to.taskId, to.sliceId, new Date().toISOString(), cardId, mapId),
        ...placement.statements,
      ]);
    });
  }

  async setCardStory(
    mapId: string,
    cardId: string,
    storyId: string | null,
  ): Repo<void> {
    return this.guard(async () => {
      await this.commit(mapId, [
        this.d1
          .prepare(
            "UPDATE story_map_cards SET story_id = ?, updated_at = ? WHERE id = ? AND map_id = ?",
          )
          .bind(storyId, new Date().toISOString(), cardId, mapId),
      ]);
    });
  }

  async deleteCard(mapId: string, cardId: string): Repo<void> {
    return this.guard(async () => {
      await this.commit(mapId, [
        this.d1
          .prepare("DELETE FROM story_map_cards WHERE id = ? AND map_id = ?")
          .bind(cardId, mapId),
      ]);
    });
  }

  async getSeq(mapId: string): Repo<number> {
    return this.guard(async () => {
      const row = await this.d1
        .prepare("SELECT seq FROM story_maps WHERE id = ?")
        .bind(mapId)
        .first<{ seq: number }>();
      return row?.seq ?? 0;
    });
  }

  async findOp(mapId: string, opId: string): Repo<StoryMapRecordedOp | null> {
    return this.guard(async () => {
      const row = await this.d1
        .prepare(
          "SELECT user_id, seq, result FROM story_map_ops WHERE map_id = ? AND op_id = ?",
        )
        .bind(mapId, opId)
        .first<{ user_id: string; seq: number; result: string }>();
      return row
        ? { userId: row.user_id, seq: row.seq, result: row.result }
        : null;
    });
  }

  async pruneOps(mapId: string, before: string): Repo<void> {
    return this.guard(async () => {
      await this.d1
        .prepare(
          "DELETE FROM story_map_ops WHERE map_id = ? AND created_at < ?",
        )
        .bind(mapId, before)
        .run();
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
  async searchStories(
    projectId: string,
    query: string,
    limit: number,
  ): Repo<(StoryMapLinkedStory & { id: string })[]> {
    return this.guard(async () => {
      const trimmed = query.trim().replace(/^#/, "");
      const escaped = trimmed.replace(/[\\%_]/g, (char) => `\\${char}`);
      const number = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
      const match = or(
        sql`${storiesTable.title} LIKE ${`%${escaped}%`} ESCAPE '\\'`,
        number === null ? undefined : eq(storiesTable.storyNumber, number),
      );
      const rows = await this.db
        .select({
          id: storiesTable.id,
          number: storiesTable.storyNumber,
          title: storiesTable.title,
          status: storiesTable.status,
          type: storiesTable.type,
          storyPoint: storiesTable.storyPoint,
          isIcebox: storiesTable.isIcebox,
        })
        .from(storiesTable)
        .where(
          and(
            eq(storiesTable.projectId, projectId),
            isNull(storiesTable.archivedAt),
            trimmed === "" ? undefined : match,
          ),
        )
        .orderBy(desc(storiesTable.storyNumber))
        .limit(limit);
      return rows.map((row) => ({ ...row, isIcebox: row.isIcebox === 1 }));
    });
  }

  async createStoryForCard(input: {
    projectId: string;
    mapId: string;
    cardId: string;
    actorUserId: string;
    title: string;
    description: string;
    type: string;
    isIcebox: boolean;
  }): Repo<{ storyId: string; storyNumber: number } | null> {
    return this.guard(async () => {
      const storyId = ulid();
      const unlinkedCard =
        "EXISTS (SELECT 1 FROM story_map_cards WHERE id = ? AND map_id = ? AND story_id IS NULL)";
      const cardBinds = [input.cardId, input.mapId];
      const now = new Date().toISOString();
      await this.d1.batch([
        this.d1
          .prepare(
            `UPDATE stories SET position = position + 1
             WHERE project_id = ? ${input.isIcebox ? "AND is_icebox = 1" : ""} AND ${unlinkedCard}`,
          )
          .bind(input.projectId, ...cardBinds),
        this.d1
          .prepare(
            `INSERT INTO stories (id, story_number, project_id, title, description, type, status, is_icebox, position)
             SELECT ?, COALESCE(MAX(story_number), 0) + 1, ?, ?, ?, ?, 'Unstarted', ?, 1
             FROM stories WHERE project_id = ? AND ${unlinkedCard}`,
          )
          .bind(
            storyId,
            input.projectId,
            input.title,
            input.description,
            input.type,
            input.isIcebox ? 1 : 0,
            input.projectId,
            ...cardBinds,
          ),
        this.d1
          .prepare(
            `UPDATE story_map_cards SET story_id = ?, updated_at = ?
             WHERE id = ? AND map_id = ? AND story_id IS NULL
               AND EXISTS (SELECT 1 FROM stories WHERE id = ?)`,
          )
          .bind(storyId, now, input.cardId, input.mapId, storyId),
        this.d1
          .prepare(
            `INSERT INTO story_timeline_entries (id, project_id, story_id, entry_type, actor_user_id, actor_name, action, field_name, new_value)
             SELECT ?, ?, id, 'activity', ?, COALESCE((SELECT email FROM users WHERE id = ?), ?), 'created', 'story', title
             FROM stories WHERE id = ?`,
          )
          .bind(
            ulid(),
            input.projectId,
            input.actorUserId,
            input.actorUserId,
            input.actorUserId,
            storyId,
          ),
        this.touch(input.mapId),
        ...(this.op === undefined
          ? []
          : [
              this.d1
                .prepare(
                  `UPDATE story_maps SET seq = seq + 1
                   WHERE id = ? AND EXISTS (SELECT 1 FROM stories WHERE id = ?)`,
                )
                .bind(input.mapId, storyId),
              this.d1
                .prepare(
                  `INSERT INTO story_map_ops (map_id, op_id, user_id, seq, result, created_at)
                   SELECT m.id, ?, ?, m.seq,
                     json_object('storyId', s.id, 'storyNumber', s.story_number), ?
                   FROM story_maps m, stories s WHERE m.id = ? AND s.id = ?`,
                )
                .bind(this.op.opId, this.op.userId, now, input.mapId, storyId),
            ]),
      ]);
      const created = await this.d1
        .prepare("SELECT story_number FROM stories WHERE id = ?")
        .bind(storyId)
        .first<{ story_number: number }>();
      return created ? { storyId, storyNumber: created.story_number } : null;
    });
  }
}
