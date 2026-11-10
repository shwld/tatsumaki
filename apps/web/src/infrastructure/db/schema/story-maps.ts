import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projectsTable } from "./projects";

export const storyMapsTable = sqliteTable(
  "story_maps",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    achievementGoal: text("achievement_goal").notNull().default(""),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_story_maps_project").on(
      table.projectId,
      table.archivedAt,
      table.createdAt,
    ),
  ],
);

export const storyMapPersonasTable = sqliteTable(
  "story_map_personas",
  {
    id: text("id").primaryKey(),
    mapId: text("map_id")
      .notNull()
      .references(() => storyMapsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("idx_story_map_personas_map").on(table.mapId, table.position),
  ],
);

export const storyMapActivitiesTable = sqliteTable(
  "story_map_activities",
  {
    id: text("id").primaryKey(),
    mapId: text("map_id")
      .notNull()
      .references(() => storyMapsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("idx_story_map_activities_map").on(table.mapId, table.position),
  ],
);

export const storyMapTasksTable = sqliteTable(
  "story_map_tasks",
  {
    id: text("id").primaryKey(),
    mapId: text("map_id")
      .notNull()
      .references(() => storyMapsTable.id, { onDelete: "cascade" }),
    activityId: text("activity_id")
      .notNull()
      .references(() => storyMapActivitiesTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("idx_story_map_tasks_activity").on(table.activityId, table.position),
    index("idx_story_map_tasks_map").on(table.mapId),
  ],
);

export const storyMapSlicesTable = sqliteTable(
  "story_map_slices",
  {
    id: text("id").primaryKey(),
    mapId: text("map_id")
      .notNull()
      .references(() => storyMapsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("idx_story_map_slices_map").on(table.mapId, table.position),
  ],
);

export const storyMapCardsTable = sqliteTable(
  "story_map_cards",
  {
    id: text("id").primaryKey(),
    mapId: text("map_id")
      .notNull()
      .references(() => storyMapsTable.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => storyMapTasksTable.id, { onDelete: "cascade" }),
    sliceId: text("slice_id").references(() => storyMapSlicesTable.id, {
      onDelete: "set null",
    }),
    position: integer("position").notNull(),
    ideaTitle: text("idea_title"),
    note: text("note").notNull().default(""),
    storyId: text("story_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_story_map_cards_cell").on(
      table.taskId,
      table.sliceId,
      table.position,
    ),
    index("idx_story_map_cards_map").on(table.mapId),
    uniqueIndex("idx_story_map_cards_story")
      .on(table.mapId, table.storyId)
      .where(sql`${table.storyId} IS NOT NULL`),
  ],
);
