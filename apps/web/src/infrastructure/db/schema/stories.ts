import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { epicsTable } from "./epics";
import { iterationsTable } from "./iterations";
import { projectsTable } from "./projects";

export const storiesTable = sqliteTable("stories", {
  id: text("id").primaryKey(),
  storyNumber: integer("story_number").notNull(),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull().default("feature"),
  status: text("status").notNull().default("Unstarted"),
  statusChangedAt: text("status_changed_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
  storyPoint: integer("story_point"),
  labels: text("labels").notNull().default("[]"),
  requesterId: text("requester_id"),
  epicId: text("epic_id").references(() => epicsTable.id, {
    onDelete: "set null",
  }),
  iterationId: text("iteration_id").references(() => iterationsTable.id, {
    onDelete: "set null",
  }),
  releaseDate: text("release_date"),
  isIcebox: integer("is_icebox").notNull().default(0),
  position: integer("position").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const storyOwnersTable = sqliteTable("story_owners", {
  storyId: text("story_id")
    .notNull()
    .references(() => storiesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const storyPriorityHistoryTable = sqliteTable("story_priority_history", {
  id: text("id").primaryKey(),
  storyId: text("story_id")
    .notNull()
    .references(() => storiesTable.id, { onDelete: "cascade" }),
  fromPosition: integer("from_position").notNull(),
  toPosition: integer("to_position").notNull(),
  changedAt: text("changed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
