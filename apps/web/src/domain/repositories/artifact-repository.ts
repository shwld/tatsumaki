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

export type ArtifactRepositoryError =
  | typeof ARTIFACT_REPOSITORY_ERROR
  | typeof ARTIFACT_NOT_FOUND_ERROR
  | typeof ARTIFACT_IDEMPOTENCY_CONFLICT_ERROR;

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
}
