import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { usersTable } from "./users";

export const notificationSettingsTable = sqliteTable("notification_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  emailEnabled: integer("email_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  targetScope: text("target_scope").notNull().default("assigned_only"),
  notifyOnStatusChanged: integer("notify_on_status_changed", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  notifyOnComment: integer("notify_on_comment", { mode: "boolean" })
    .notNull()
    .default(true),
  notifyOnEstimate: integer("notify_on_estimate", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
