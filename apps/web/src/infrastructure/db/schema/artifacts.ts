import { sql } from "drizzle-orm";
import {
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import { projectsTable } from "./projects";

export const artifactsTable = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  archivedAt: text("archived_at"),
  latestVersion: integer("latest_version"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const artifactVersionsTable = sqliteTable(
  "artifact_versions",
  {
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifactsTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    entrypoint: text("entrypoint").notNull(),
    treeDigest: text("tree_digest").notNull(),
    fileCount: integer("file_count").notNull(),
    totalBytes: integer("total_bytes").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.artifactId, table.version] })],
);

export const artifactFilesTable = sqliteTable(
  "artifact_files",
  {
    artifactId: text("artifact_id").notNull(),
    version: integer("version").notNull(),
    path: text("path").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    contentType: text("content_type").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.artifactId, table.version, table.path] }),
    foreignKey({
      columns: [table.artifactId, table.version],
      foreignColumns: [
        artifactVersionsTable.artifactId,
        artifactVersionsTable.version,
      ],
    }).onDelete("cascade"),
  ],
);

export const artifactUploadSessionsTable = sqliteTable(
  "artifact_upload_sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    artifactId: text("artifact_id").notNull(),
    baseVersion: integer("base_version"),
    treeDigest: text("tree_digest").notNull(),
    manifestJson: text("manifest_json").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status", {
      enum: ["pending", "published", "expired"],
    }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique().on(table.projectId, table.createdBy, table.idempotencyKey),
  ],
);

export const artifactUploadSessionFilesTable = sqliteTable(
  "artifact_upload_session_files",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => artifactUploadSessionsTable.id, {
        onDelete: "cascade",
      }),
    path: text("path").notNull(),
    uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.path] })],
);
