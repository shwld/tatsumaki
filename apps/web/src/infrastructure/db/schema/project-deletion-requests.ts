import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projectDeletionRequestsTable = sqliteTable(
  "project_deletion_requests",
  {
    projectId: text("project_id").primaryKey(),
    requestedByUserId: text("requested_by_user_id").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);
