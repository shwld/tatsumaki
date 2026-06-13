import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projectsTable = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  isPublic: integer("is_public").notNull().default(0),
  timezone: text("timezone").notNull().default("Asia/Tokyo"),
  sprintDurationDays: integer("sprint_duration_days").notNull().default(14),
  pointScaleType: text("point_scale_type").notNull().default("fibonacci"),
  customPointScale: text("custom_point_scale"),
  estimateBugs: integer("estimate_bugs").notNull().default(1),
  estimateChores: integer("estimate_chores").notNull().default(1),
  iterationStartDay: integer("iteration_start_day").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
