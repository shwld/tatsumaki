import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { projectsTable } from "./projects";

export const iterationOverridesTable = sqliteTable(
  "iteration_overrides",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    iterationNumber: integer("iteration_number").notNull(),
    sprintUtilizationPercent: integer("sprint_utilization_percent").notNull(),
    iterationStartDate: text("iteration_start_date"),
    iterationEndDate: text("iteration_end_date"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => {
    return {
      projectIterationNumberUnique: uniqueIndex(
        "idx_iteration_overrides_project_number",
      ).on(table.projectId, table.iterationNumber),
      projectIndex: index("idx_iteration_overrides_project").on(
        table.projectId,
      ),
    };
  },
);
