import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { storiesTable } from "./stories";

export const storyAttachmentsTable = sqliteTable("story_attachments", {
  id: text("id").primaryKey(),
  storyId: text("story_id")
    .notNull()
    .references(() => storiesTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileKey: text("file_key").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
