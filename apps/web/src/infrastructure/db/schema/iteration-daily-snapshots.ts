import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { iterationsTable } from "./iterations";

export const iterationDailySnapshotsTable = sqliteTable(
  "iteration_daily_snapshots",
  {
    iterationId: text("iteration_id")
      .notNull()
      .references(() => iterationsTable.id, { onDelete: "cascade" }),
    snapshotDate: text("snapshot_date").notNull(),
    scopePoints: integer("scope_points").notNull(),
    remainingPoints: integer("remaining_points").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.iterationId, table.snapshotDate] }),
  }),
);
