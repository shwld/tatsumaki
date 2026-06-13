import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projectsTable } from "./projects";

export const iterationsTable = sqliteTable(
  "iterations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    iterationNumber: integer("iteration_number").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    burndownScopePoints: integer("burndown_scope_points"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => {
    return {
      projectDateUnique: uniqueIndex("idx_iterations_project_date").on(
        table.projectId,
        table.startDate,
      ),
      projectIterationNumberUnique: uniqueIndex(
        "idx_iterations_project_number",
      ).on(table.projectId, table.iterationNumber),
    };
  },
);
