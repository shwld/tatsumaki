import type { Result } from "neverthrow";

export const ARTIFACT_CLEANUP_REPOSITORY_ERROR =
  "ARTIFACT_CLEANUP_REPOSITORY_ERROR" as const;

export type ArtifactCleanupRepositoryError =
  typeof ARTIFACT_CLEANUP_REPOSITORY_ERROR;

export type AbandonedUploadSession = {
  id: string;
  projectId: string;
  artifactId: string;
  /** Distinct sha256 values listed in the session manifest. */
  blobSha256s: string[];
};

export interface ArtifactCleanupRepository {
  /** Pending sessions whose expiry is older than `expiredBefore` (ISO). */
  listAbandonedSessions(input: {
    expiredBefore: string;
    limit: number;
  }): Promise<Result<AbandonedUploadSession[], ArtifactCleanupRepositoryError>>;

  /** Hashes among `sha256s` that a published version of the artifact uses. */
  findReferencedHashes(
    artifactId: string,
    sha256s: string[],
  ): Promise<Result<Set<string>, ArtifactCleanupRepositoryError>>;

  /** Hashes listed by other sessions of the artifact that may still upload. */
  findInFlightHashes(input: {
    artifactId: string;
    excludeSessionId: string;
    activeSince: string;
  }): Promise<Result<Set<string>, ArtifactCleanupRepositoryError>>;

  markSessionsExpired(
    sessionIds: string[],
  ): Promise<Result<void, ArtifactCleanupRepositoryError>>;

  findExistingProjectIds(
    projectIds: string[],
  ): Promise<Result<Set<string>, ArtifactCleanupRepositoryError>>;
}
