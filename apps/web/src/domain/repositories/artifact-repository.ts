import type { Result } from "neverthrow";
import type {
  Artifact,
  ArtifactFile,
  ArtifactManifestEntry,
  ArtifactUploadSession,
  ArtifactVersion,
} from "../entities/artifact";

export const ARTIFACT_REPOSITORY_ERROR = "ARTIFACT_REPOSITORY_ERROR" as const;
export const ARTIFACT_NOT_FOUND_ERROR = "ARTIFACT_NOT_FOUND_ERROR" as const;
export const ARTIFACT_IDEMPOTENCY_CONFLICT_ERROR =
  "ARTIFACT_IDEMPOTENCY_CONFLICT_ERROR" as const;
export const ARTIFACT_PUBLISH_CONFLICT_ERROR =
  "ARTIFACT_PUBLISH_CONFLICT_ERROR" as const;
export const ARTIFACT_UPLOAD_SESSION_EXPIRED_ERROR =
  "ARTIFACT_UPLOAD_SESSION_EXPIRED_ERROR" as const;

export type ArtifactRepositoryError =
  | typeof ARTIFACT_REPOSITORY_ERROR
  | typeof ARTIFACT_NOT_FOUND_ERROR
  | typeof ARTIFACT_IDEMPOTENCY_CONFLICT_ERROR
  | typeof ARTIFACT_PUBLISH_CONFLICT_ERROR
  | typeof ARTIFACT_UPLOAD_SESSION_EXPIRED_ERROR;

export type CreateArtifactInput = {
  id: string;
  projectId: string;
  title: string;
  createdBy: string;
};

export type UpdateArtifactMetadataInput = {
  title?: string;
  archived?: boolean;
};

export type CreateUploadSessionInput = {
  id: string;
  projectId: string;
  artifactId: string;
  baseVersion: number | null;
  title: string;
  entrypoint: string;
  treeDigest: string;
  manifest: ArtifactManifestEntry[];
  requestHash: string;
  idempotencyKey: string;
  expiresAt: string;
  createdBy: string;
};

export type ArtifactVersionDetail = {
  version: ArtifactVersion;
  files: ArtifactFile[];
};

export type PublishedArtifactVersion = {
  artifactId: string;
  version: number;
};

export interface ArtifactRepository {
  create(
    input: CreateArtifactInput,
  ): Promise<Result<Artifact, ArtifactRepositoryError>>;

  findById(
    projectId: string,
    artifactId: string,
  ): Promise<Result<Artifact | null, ArtifactRepositoryError>>;

  listByProject(
    projectId: string,
    options: { archived: boolean },
  ): Promise<Result<Artifact[], ArtifactRepositoryError>>;

  /** Changes artifact metadata only; never creates a content version. */
  updateMetadata(
    projectId: string,
    artifactId: string,
    input: UpdateArtifactMetadataInput,
  ): Promise<Result<Artifact, ArtifactRepositoryError>>;

  listVersions(
    projectId: string,
    artifactId: string,
  ): Promise<Result<ArtifactVersion[], ArtifactRepositoryError>>;

  findVersion(
    projectId: string,
    artifactId: string,
    version: number,
  ): Promise<Result<ArtifactVersionDetail | null, ArtifactRepositoryError>>;

  /**
   * Returns the existing session for the same (project, creator, key) as-is
   * regardless of its status; a different requestHash yields
   * ARTIFACT_IDEMPOTENCY_CONFLICT_ERROR.
   */
  createUploadSession(
    input: CreateUploadSessionInput,
  ): Promise<Result<ArtifactUploadSession, ArtifactRepositoryError>>;

  /** Scoped to the creator so other users get null (IDOR guard). */
  findUploadSession(
    projectId: string,
    sessionId: string,
    createdBy: string,
  ): Promise<Result<ArtifactUploadSession | null, ArtifactRepositoryError>>;

  recordUploadedFile(
    sessionId: string,
    path: string,
  ): Promise<Result<void, ArtifactRepositoryError>>;

  countUploadedFiles(
    sessionId: string,
  ): Promise<Result<number, ArtifactRepositoryError>>;

  listUploadedPaths(
    sessionId: string,
  ): Promise<Result<string[], ArtifactRepositoryError>>;

  /**
   * Atomically publishes the session as a new version. Publishing an already
   * published session returns the same result. A session that lost to another
   * publish yields ARTIFACT_PUBLISH_CONFLICT_ERROR, an expired one
   * ARTIFACT_UPLOAD_SESSION_EXPIRED_ERROR.
   */
  publishUploadSession(input: {
    projectId: string;
    sessionId: string;
    createdBy: string;
  }): Promise<Result<PublishedArtifactVersion, ArtifactRepositoryError>>;
}
