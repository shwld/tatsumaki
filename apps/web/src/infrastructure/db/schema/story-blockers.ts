import { sql } from "drizzle-orm";
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { storiesTable } from "./stories";

export const storyBlockersTable = sqliteTable(
  "story_blockers",
  {
    id: text("id").primaryKey(),
    blockingStoryId: text("blocking_story_id")
      .notNull()
      .references(() => storiesTable.id, { onDelete: "cascade" }),
    blockedStoryId: text("blocked_story_id")
      .notNull()
      .references(() => storiesTable.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => {
    return {
      storyBlockersUnique: uniqueIndex("story_blockers_unique").on(
        table.blockingStoryId,
        table.blockedStoryId,
      ),
    };
  },
);
