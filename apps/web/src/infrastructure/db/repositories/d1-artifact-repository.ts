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
  ARTIFACT_REPOSITORY_ERROR,
  type ArtifactRepository,
  type ArtifactRepositoryError,
  type ArtifactVersionDetail,
  type CreateArtifactInput,
  type CreateUploadSessionInput,
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

export class D1ArtifactRepository implements ArtifactRepository {
  private readonly db: DbClient;

  constructor(d1: D1Database) {
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
}
