import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projectLabelsTable } from "./project-labels";
import { projectsTable } from "./projects";
import { usersTable } from "./users";

export const epicsTable = sqliteTable(
  "epics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    labelId: text("label_id").references(() => projectLabelsTable.id, {
      onDelete: "cascade",
    }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    description: text("description").notNull().default(""),
    plannedStart: text("planned_start"),
    plannedEnd: text("planned_end"),
    position: integer("position").notNull().default(0),
    outcomeStatus: text("outcome_status", {
      enum: ["unevaluated", "achieved", "missed"],
    })
      .notNull()
      .default("unevaluated"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_epics_label_id").on(table.labelId)],
);

export const epicOwnersTable = sqliteTable(
  "epic_owners",
  {
    epicId: text("epic_id")
      .notNull()
      .references(() => epicsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.epicId, table.userId] })],
);
