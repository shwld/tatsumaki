import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import type {
  Artifact,
  ArtifactFile,
  ArtifactManifestEntry,
  ArtifactUploadSession,
  ArtifactVersion,
} from "../../../domain/entities/artifact";
import {
  ARTIFACT_IDEMPOTENCY_CONFLICT_ERROR,
  ARTIFACT_NOT_FOUND_ERROR,
  ARTIFACT_PUBLISH_CONFLICT_ERROR,
  ARTIFACT_REPOSITORY_ERROR,
  ARTIFACT_UPLOAD_SESSION_EXPIRED_ERROR,
  type ArtifactRepository,
  type ArtifactRepositoryError,
  type ArtifactVersionDetail,
  type CreateArtifactInput,
  type CreateUploadSessionInput,
  type PublishedArtifactVersion,
  type UpdateArtifactMetadataInput,
} from "../../../domain/repositories/artifact-repository";
import { createDb, type DbClient } from "../client";
import {
  artifactFilesTable,
  artifactUploadSessionFilesTable,
  artifactUploadSessionsTable,
  artifactVersionsTable,
  artifactsTable,
} from "../schema/artifacts";

type UploadSessionRow = typeof artifactUploadSessionsTable.$inferSelect;

function toArtifact(row: typeof artifactsTable.$inferSelect): Artifact {
  return { __typename: "Artifact", ...row };
}

function toArtifactVersion(
  row: typeof artifactVersionsTable.$inferSelect,
): ArtifactVersion {
  return { __typename: "ArtifactVersion", ...row };
}

function toArtifactFile(
  row: typeof artifactFilesTable.$inferSelect,
): ArtifactFile {
  return { __typename: "ArtifactFile", ...row };
}

function toUploadSession(row: UploadSessionRow): ArtifactUploadSession {
  const { manifestJson, ...rest } = row;
  return {
    __typename: "ArtifactUploadSession",
    ...rest,
    manifest: JSON.parse(manifestJson) as ArtifactManifestEntry[],
  };
}

function isSessionExpired(session: ArtifactUploadSession): boolean {
  return (
    session.status === "expired" ||
    new Date(session.expiresAt).getTime() <= Date.now()
  );
}

export class D1ArtifactRepository implements ArtifactRepository {
  private readonly db: DbClient;

  constructor(private readonly d1: D1Database) {
    this.db = createDb(d1);
  }

  async create(
    input: CreateArtifactInput,
  ): Promise<Result<Artifact, ArtifactRepositoryError>> {
    try {
      const now = new Date().toISOString();
      const row = await this.db
        .insert(artifactsTable)
        .values({
          id: input.id,
          projectId: input.projectId,
          title: input.title,
          createdBy: input.createdBy,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      return ok(toArtifact(row));
    } catch {
      return err(ARTIFACT_REPOSITORY_ERROR);
    }
  }

  async findById(
    projectId: string,
    artifactId: string,
  ): Promise<Result<Artifact | null, ArtifactRepositoryError>> {
    try {
      const row = await this.db
        .select()
        .from(artifactsTable)
        .where(
          and(
            eq(artifactsTable.projectId, projectId),
            eq(artifactsTable.id, artifactId),
          ),
        )
        .get();
      return ok(row ? toArtifact(row) : null);
    } catch {
      return err(ARTIFACT_REPOSITORY_ERROR);
    }
  }

  async listByProject(
    projectId: string,
    options: { archived: boolean },
  ): Promise<Result<Artifact[], ArtifactRepositoryError>> {
    try {
      const rows = await this.db
        .select()
        .from(artifactsTable)
        .where(
          and(
            eq(artifactsTable.projectId, projectId),
            options.archived
              ? isNotNull(artifactsTable.archivedAt)
              : isNull(artifactsTable.archivedAt),
          ),
        )
        .orderBy(desc(artifactsTable.updatedAt), desc(artifactsTable.id))
        .all();
      return ok(rows.map(toArtifact));
    } catch {
      return err(ARTIFACT_REPOSITORY_ERROR);
    }
  }

  async updateMetadata(
    projectId: string,
    artifactId: string,
    input: UpdateArtifactMetadataInput,
  ): Promise<Result<Artifact, ArtifactRepositoryError>> {
    try {
      const now = new Date().toISOString();
      const row = await this.db
        .update(artifactsTable)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.archived !== undefined
            ? { archivedAt: input.archived ? now : null }
            : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(artifactsTable.projectId, projectId),
            eq(artifactsTable.id, artifactId),
          ),
        )
        .returning()
        .get();
      if (!row) return err(ARTIFACT_NOT_FOUND_ERROR);
      return ok(toArtifact(row));
    } catch {
      return err(ARTIFACT_REPOSITORY_ERROR);
    }
  }

  async listVersions(
    projectId: string,
    artifactId: string,
  ): Promise<Result<ArtifactVersion[], ArtifactRepositoryError>> {
    try {
      const rows = await this.db
        .select({ version: artifactVersionsTable })
        .from(artifactVersionsTable)
        .innerJoin(
          artifactsTable,
          eq(artifactVersionsTable.artifactId, artifactsTable.id),
        )
        .where(
          and(
            eq(artifactsTable.projectId, projectId),
            eq(artifactVersionsTable.artifactId, artifactId),
          ),
        )
        .orderBy(desc(artifactVersionsTable.version))
        .all();
      return ok(rows.map((row) => toArtifactVersion(row.version)));
    } catch {
      return err(ARTIFACT_REPOSITORY_ERROR);
    }
  }

  async findVersion(
    projectId: string,
    artifactId: string,
    version: number,
  ): Promise<Result<ArtifactVersionDetail | null, ArtifactRepositoryError>> {
    try {
      const versionRow = await this.db
        .select({ version: artifactVersionsTable })
        .from(artifactVersionsTable)
        .innerJoin(
          artifactsTable,
          eq(artifactVersionsTable.artifactId, artifactsTable.id),
        )
        .where(
          and(
            eq(artifactsTable.projectId, projectId),
            eq(artifactVersionsTable.artifactId, artifactId),
            eq(artifactVersionsTable.version, version),
          ),
        )
        .get();
      if (!versionRow) return ok(null);

      const fileRows = await this.db
        .select()
        .from(artifactFilesTable)
        .where(
          and(
            eq(artifactFilesTable.artifactId, artifactId),
            eq(artifactFilesTable.version, version),
          ),
        )
        .orderBy(asc(artifactFilesTable.path))
        .all();

      return ok({
        version: toArtifactVersion(versionRow.version),
        files: fileRows.map(toArtifactFile),
      });
    } catch {
      return err(ARTIFACT_REPOSITORY_ERROR);
    }
  }

  async createUploadSession(
    input: CreateUploadSessionInput,
  ): Promise<Result<ArtifactUploadSession, ArtifactRepositoryError>> {
    try {
      const existing = await this.findByIdempotencyKey(input);
      if (existing) return this.resolveExisting(existing, input.requestHash);

      const inserted = await this.db
        .insert(artifactUploadSessionsTable)
        .values({
          id: input.id,
          projectId: input.projectId,
          artifactId: input.artifactId,
          baseVersion: input.baseVersion,
          title: input.title,
          entrypoint: input.entrypoint,
          treeDigest: input.treeDigest,
          manifestJson: JSON.stringify(input.manifest),
          requestHash: input.requestHash,
          status: "pending",
          idempotencyKey: input.idempotencyKey,
          expiresAt: input.expiresAt,
          createdBy: input.createdBy,
        })
        .onConflictDoNothing()
        .returning()
        .get();
      if (inserted) return ok(toUploadSession(inserted));

      const raced = await this.findByIdempotencyKey(input);
      if (!raced) return err(ARTIFACT_REPOSITORY_ERROR);
      return this.resolveExisting(raced, input.requestHash);
    } catch {
      return err(ARTIFACT_REPOSITORY_ERROR);
    }
  }

  private findByIdempotencyKey(
    input: CreateUploadSessionInput,
  ): Promise<UploadSessionRow | undefined> {
    return this.db
      .select()
      .from(artifactUploadSessionsTable)
      .where(
        and(
          eq(artifactUploadSessionsTable.projectId, input.projectId),
          eq(artifactUploadSessionsTable.createdBy, input.createdBy),
          eq(artifactUploadSessionsTable.idempotencyKey, input.idempotencyKey),
        ),
      )
      .get();
  }

  private resolveExisting(
    row: UploadSessionRow,
    requestHash: string,
  ): Result<ArtifactUploadSession, ArtifactRepositoryError> {
    if (row.requestHash !== requestHash) {
      return err(ARTIFACT_IDEMPOTENCY_CONFLICT_ERROR);
    }
    return ok(toUploadSession(row));
  }

  async findUploadSession(
    projectId: string,
    sessionId: string,
    createdBy: string,
  ): Promise<Result<ArtifactUploadSession | null, ArtifactRepositoryError>> {
    try {
      const row = await this.db
        .select()
        .from(artifactUploadSessionsTable)
        .where(
          and(
            eq(artifactUploadSessionsTable.projectId, projectId),
            eq(artifactUploadSessionsTable.id, sessionId),
            eq(artifactUploadSessionsTable.createdBy, createdBy),
          ),
        )
        .get();
      return ok(row ? toUploadSession(row) : null);
    } catch {
      return err(ARTIFACT_REPOSITORY_ERROR);
    }
  }

  async findUploadSessionByIdempotencyKey(
    projectId: string,
    createdBy: string,
    idempotencyKey: string,
  ): Promise<Result<ArtifactUploadSession | null, ArtifactRepositoryError>> {
    try {
      const row = await this.db
        .select()
        .from(artifactUploadSessionsTable)
        .where(
          and(
            eq(artifactUploadSessionsTable.projectId, projectId),
            eq(artifactUploadSessionsTable.createdBy, createdBy),
            eq(artifactUploadSessionsTable.idempotencyKey, idempotencyKey),
          ),
        )
        .get();
      return ok(row ? toUploadSession(row) : null);
    } catch {
      return err(ARTIFACT_REPOSITORY_ERROR);
    }
  }

  async recordUploadedFile(
    sessionId: string,
    path: string,
  ): Promise<Result<void, ArtifactRepositoryError>> {
    try {
      await this.db
        .insert(artifactUploadSessionFilesTable)
        .values({ sessionId, path })
        .onConflictDoNothing();
      return ok(undefined);
    } catch {
      return err(ARTIFACT_REPOSITORY_ERROR);
    }
  }

  async countUploadedFiles(
    sessionId: string,
  ): Promise<Result<number, ArtifactRepositoryError>> {
    try {
      const row = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(artifactUploadSessionFilesTable)
        .where(eq(artifactUploadSessionFilesTable.sessionId, sessionId))
        .get();
      return ok(row?.count ?? 0);
    } catch {
      return err(ARTIFACT_REPOSITORY_ERROR);
    }
  }

  async listUploadedPaths(
    sessionId: string,
  ): Promise<Result<string[], ArtifactRepositoryError>> {
    try {
      const rows = await this.db
        .select({ path: artifactUploadSessionFilesTable.path })
        .from(artifactUploadSessionFilesTable)
        .where(eq(artifactUploadSessionFilesTable.sessionId, sessionId))
        .orderBy(asc(artifactUploadSessionFilesTable.path))
        .all();
      return ok(rows.map((row) => row.path));
    } catch {
      return err(ARTIFACT_REPOSITORY_ERROR);
    }
  }

  async publishUploadSession(input: {
    projectId: string;
    sessionId: string;
    createdBy: string;
  }): Promise<Result<PublishedArtifactVersion, ArtifactRepositoryError>> {
    try {
      const sessionResult = await this.findUploadSession(
        input.projectId,
        input.sessionId,
        input.createdBy,
      );
      if (sessionResult.isErr()) return err(sessionResult.error);
      const session = sessionResult.value;
      if (!session) return err(ARTIFACT_NOT_FOUND_ERROR);

      const published: PublishedArtifactVersion = {
        artifactId: session.artifactId,
        version: (session.baseVersion ?? 0) + 1,
      };
      if (session.status === "published") return ok(published);
      if (isSessionExpired(session)) {
        return err(ARTIFACT_UPLOAD_SESSION_EXPIRED_ERROR);
      }

      // Every statement is guarded by the same session predicate, so an
      // invalid or superseded session changes nothing. D1 only rolls the batch
      // back on an error, and zero affected rows is not one: the final UPDATE
      // is the commit marker we check afterwards.
      const valid =
        "s.id = ? AND s.project_id = ? AND s.created_by = ? AND s.status = 'pending' AND datetime(s.expires_at) > CURRENT_TIMESTAMP";
      const validArgs = [input.sessionId, input.projectId, input.createdBy];
      const artifactExists =
        "EXISTS (SELECT 1 FROM artifacts a WHERE a.id = s.artifact_id AND a.project_id = s.project_id)";
      const versionExists =
        "EXISTS (SELECT 1 FROM artifact_versions v WHERE v.artifact_id = s.artifact_id AND v.version = COALESCE(s.base_version, 0) + 1 AND v.session_id = s.id)";

      let results: D1Result[];
      try {
        results = await this.d1.batch([
          this.d1
            .prepare(
              `INSERT INTO artifacts (id, project_id, title, latest_version, created_by)
               SELECT s.artifact_id, s.project_id, s.title, NULL, s.created_by
               FROM artifact_upload_sessions s
               WHERE ${valid} AND s.base_version IS NULL`,
            )
            .bind(...validArgs),
          this.d1
            .prepare(
              `INSERT INTO artifact_versions (artifact_id, version, entrypoint, tree_digest, file_count, total_bytes, session_id, created_by)
               SELECT s.artifact_id, COALESCE(s.base_version, 0) + 1, s.entrypoint, s.tree_digest,
                      json_array_length(s.manifest_json),
                      (SELECT COALESCE(SUM(json_extract(j.value, '$.size')), 0) FROM json_each(s.manifest_json) j),
                      s.id, s.created_by
               FROM artifact_upload_sessions s
               WHERE ${valid} AND ${artifactExists}
                 AND (SELECT a.latest_version FROM artifacts a WHERE a.id = s.artifact_id) IS s.base_version`,
            )
            .bind(...validArgs),
          this.d1
            .prepare(
              `INSERT INTO artifact_files (artifact_id, version, path, size, sha256, content_type)
               SELECT s.artifact_id, COALESCE(s.base_version, 0) + 1,
                      json_extract(j.value, '$.path'), json_extract(j.value, '$.size'),
                      json_extract(j.value, '$.sha256'), json_extract(j.value, '$.contentType')
               FROM artifact_upload_sessions s, json_each(s.manifest_json) j
               WHERE ${valid} AND ${versionExists}`,
            )
            .bind(...validArgs),
          this.d1
            .prepare(
              `UPDATE artifacts SET latest_version = COALESCE(s.base_version, 0) + 1, updated_at = CURRENT_TIMESTAMP
               FROM artifact_upload_sessions s
               WHERE artifacts.id = s.artifact_id AND ${valid}
                 AND artifacts.latest_version IS s.base_version AND ${versionExists}`,
            )
            .bind(...validArgs),
          this.d1
            .prepare(
              `UPDATE artifact_upload_sessions SET status = 'published'
               WHERE id = ? AND project_id = ? AND created_by = ? AND status = 'pending'
                 AND datetime(expires_at) > CURRENT_TIMESTAMP
                 AND EXISTS (SELECT 1 FROM artifacts a
                             JOIN artifact_versions v ON v.artifact_id = a.id AND v.session_id = artifact_upload_sessions.id
                             WHERE a.id = artifact_upload_sessions.artifact_id
                               AND a.latest_version = v.version)`,
            )
            .bind(...validArgs),
        ]);
      } catch {
        return this.classifyPublishFailure(input, published);
      }

      if ((results[4]?.meta.changes ?? 0) === 1) return ok(published);
      return this.classifyPublishFailure(input, published);
    } catch {
      return err(ARTIFACT_REPOSITORY_ERROR);
    }
  }

  /** Re-reads the session to tell an idempotent retry from a lost race. */
  private async classifyPublishFailure(
    input: { projectId: string; sessionId: string; createdBy: string },
    published: PublishedArtifactVersion,
  ): Promise<Result<PublishedArtifactVersion, ArtifactRepositoryError>> {
    const reread = await this.findUploadSession(
      input.projectId,
      input.sessionId,
      input.createdBy,
    );
    if (reread.isErr() || !reread.value) return err(ARTIFACT_REPOSITORY_ERROR);
    if (reread.value.status === "published") return ok(published);
    if (isSessionExpired(reread.value)) {
      return err(ARTIFACT_UPLOAD_SESSION_EXPIRED_ERROR);
    }
    return err(ARTIFACT_PUBLISH_CONFLICT_ERROR);
  }
}
