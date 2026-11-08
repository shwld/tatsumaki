import { sql } from "drizzle-orm";
import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projectLabelsTable } from "./project-labels";
import { projectsTable } from "./projects";
import { storiesTable } from "./stories";

export const storyLabelsTable = sqliteTable(
  "story_labels",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    storyId: text("story_id")
      .notNull()
      .references(() => storiesTable.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => projectLabelsTable.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.storyId, table.labelId] })],
);
