import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const objectSweepCursorsTable = sqliteTable("object_sweep_cursors", {
  scope: text("scope").primaryKey(),
  startAfter: text("start_after"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
