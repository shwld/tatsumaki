import { sql } from "drizzle-orm";
import { sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const projectCreationRequestsTable = sqliteTable(
  "project_creation_requests",
  {
    projectId: text("project_id").primaryKey(),
    purchaserUserId: text("purchaser_user_id").notNull(),
    name: text("name").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    checkoutRequestId: text("checkout_request_id").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    purchaserKey: unique().on(table.purchaserUserId, table.idempotencyKey),
  }),
);
