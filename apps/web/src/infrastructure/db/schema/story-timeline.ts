import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projectsTable } from "./projects";
import { storiesTable } from "./stories";

export const storyTimelineEntriesTable = sqliteTable("story_timeline_entries", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  storyId: text("story_id").references(() => storiesTable.id, {
    onDelete: "set null",
  }),
  entryType: text("entry_type").notNull(),
  actorUserId: text("actor_user_id"),
  actorName: text("actor_name").notNull(),
  action: text("action"),
  fieldName: text("field_name"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  body: text("body"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
