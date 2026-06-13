import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projectInvitationsTable } from "./project-members";
import { projectsTable } from "./projects";
import { storiesTable } from "./stories";

export const notificationsTable = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  recipientUserId: text("recipient_user_id").notNull(),
  actorUserId: text("actor_user_id"),
  actorName: text("actor_name").notNull(),
  storyId: text("story_id").references(() => storiesTable.id, {
    onDelete: "cascade",
  }),
  storyTitleSnapshot: text("story_title_snapshot"),
  invitationId: text("invitation_id").references(
    () => projectInvitationsTable.id,
    { onDelete: "cascade" },
  ),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
