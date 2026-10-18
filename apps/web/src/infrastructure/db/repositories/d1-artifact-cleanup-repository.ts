import { err, ok, type Result } from "neverthrow";
import {
  ARTIFACT_CLEANUP_REPOSITORY_ERROR,
  type AbandonedUploadSession,
  type ArtifactCleanupRepository,
  type ArtifactCleanupRepositoryError,
} from "../../../domain/repositories/artifact-cleanup-repository";

// D1 allows at most 100 bound parameters per statement.
const CHUNK_SIZE = 80;

function chunk<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += CHUNK_SIZE) {
    chunks.push(items.slice(index, index + CHUNK_SIZE));
  }
  return chunks;
}

const placeholders = (count: number) => Array(count).fill("?").join(", ");

export class D1ArtifactCleanupRepository implements ArtifactCleanupRepository {
  constructor(private readonly d1: D1Database) {}

  async listAbandonedSessions(input: {
    expiredBefore: string;
    limit: number;
  }): Promise<
    Result<AbandonedUploadSession[], ArtifactCleanupRepositoryError>
  > {
    try {
      const { results } = await this.d1
        .prepare(
          `SELECT id, project_id, artifact_id, manifest_json
           FROM artifact_upload_sessions
           WHERE status = 'pending' AND datetime(expires_at) < datetime(?)
           ORDER BY expires_at
           LIMIT ?`,
        )
        .bind(input.expiredBefore, input.limit)
        .all<{
          id: string;
          project_id: string;
          artifact_id: string;
          manifest_json: string;
        }>();
      return ok(
        results.map((row) => ({
          id: row.id,
          projectId: row.project_id,
          artifactId: row.artifact_id,
          blobSha256s: [
            ...new Set(
              (JSON.parse(row.manifest_json) as Array<{ sha256: string }>).map(
                (entry) => entry.sha256,
              ),
            ),
          ],
        })),
      );
    } catch {
      return err(ARTIFACT_CLEANUP_REPOSITORY_ERROR);
    }
  }

  async findReferencedHashes(
    artifactId: string,
    sha256s: string[],
  ): Promise<Result<Set<string>, ArtifactCleanupRepositoryError>> {
    try {
      const found = new Set<string>();
      for (const part of chunk(sha256s)) {
        const { results } = await this.d1
          .prepare(
            `SELECT DISTINCT sha256 FROM artifact_files
             WHERE artifact_id = ? AND sha256 IN (${placeholders(part.length)})`,
          )
          .bind(artifactId, ...part)
          .all<{ sha256: string }>();
        for (const row of results) found.add(row.sha256);
      }
      return ok(found);
    } catch {
      return err(ARTIFACT_CLEANUP_REPOSITORY_ERROR);
    }
  }

  async findInFlightHashes(input: {
    artifactId: string;
    excludeSessionId: string;
    activeSince: string;
  }): Promise<Result<Set<string>, ArtifactCleanupRepositoryError>> {
    try {
      const { results } = await this.d1
        .prepare(
          `SELECT DISTINCT json_extract(j.value, '$.sha256') AS sha256
           FROM artifact_upload_sessions s, json_each(s.manifest_json) j
           WHERE s.artifact_id = ? AND s.id != ? AND s.status = 'pending'
             AND datetime(s.expires_at) >= datetime(?)`,
        )
        .bind(input.artifactId, input.excludeSessionId, input.activeSince)
        .all<{ sha256: string }>();
      return ok(new Set(results.map((row) => row.sha256)));
    } catch {
      return err(ARTIFACT_CLEANUP_REPOSITORY_ERROR);
    }
  }

  async markSessionsExpired(
    sessionIds: string[],
  ): Promise<Result<void, ArtifactCleanupRepositoryError>> {
    try {
      for (const part of chunk(sessionIds)) {
        await this.d1
          .prepare(
            `UPDATE artifact_upload_sessions SET status = 'expired'
             WHERE status = 'pending' AND id IN (${placeholders(part.length)})`,
          )
          .bind(...part)
          .run();
      }
      return ok(undefined);
    } catch {
      return err(ARTIFACT_CLEANUP_REPOSITORY_ERROR);
    }
  }

  async findExistingProjectIds(
    projectIds: string[],
  ): Promise<Result<Set<string>, ArtifactCleanupRepositoryError>> {
    try {
      const found = new Set<string>();
      for (const part of chunk(projectIds)) {
        const { results } = await this.d1
          .prepare(
            `SELECT id FROM projects WHERE id IN (${placeholders(part.length)})`,
          )
          .bind(...part)
          .all<{ id: string }>();
        for (const row of results) found.add(row.id);
      }
      return ok(found);
    } catch {
      return err(ARTIFACT_CLEANUP_REPOSITORY_ERROR);
    }
  }
}
