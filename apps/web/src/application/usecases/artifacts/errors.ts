import type { ArtifactManifestErrorCode } from "../../../domain/artifacts/manifest";
import {
  ARTIFACT_IDEMPOTENCY_CONFLICT_ERROR,
  ARTIFACT_NOT_FOUND_ERROR,
  ARTIFACT_PUBLISH_CONFLICT_ERROR,
  ARTIFACT_UPLOAD_SESSION_EXPIRED_ERROR,
  type ArtifactRepositoryError,
} from "../../../domain/repositories/artifact-repository";

export type ArtifactErrorCode =
  | ArtifactManifestErrorCode
  | "INVALID_REQUEST"
  | "FORBIDDEN"
  | "ARTIFACT_NOT_FOUND"
  | "VERSION_NOT_FOUND"
  | "FILE_NOT_FOUND"
  | "BASE_VERSION_CONFLICT"
  | "IDEMPOTENCY_KEY_REUSED"
  | "SESSION_NOT_FOUND"
  | "SESSION_EXPIRED"
  | "SESSION_NOT_PENDING"
  | "FILE_NOT_IN_MANIFEST"
  | "FILE_SIZE_MISMATCH"
  | "FILE_DIGEST_MISMATCH"
  | "UPLOAD_INCOMPLETE"
  | "PUBLISH_CONFLICT"
  | "STORAGE_ERROR"
  | "INTERNAL_ERROR";

export type ArtifactError = { code: ArtifactErrorCode; message: string };

export function artifactError(
  code: ArtifactErrorCode,
  message: string,
): ArtifactError {
  return { code, message };
}

export function fromRepositoryError(
  error: ArtifactRepositoryError,
): ArtifactError {
  switch (error) {
    case ARTIFACT_IDEMPOTENCY_CONFLICT_ERROR:
      return artifactError(
        "IDEMPOTENCY_KEY_REUSED",
        "Idempotency-Key was already used with a different request",
      );
    case ARTIFACT_PUBLISH_CONFLICT_ERROR:
      return artifactError(
        "PUBLISH_CONFLICT",
        "Another version was published first; restart from the latest version",
      );
    case ARTIFACT_UPLOAD_SESSION_EXPIRED_ERROR:
      return artifactError("SESSION_EXPIRED", "Upload session has expired");
    case ARTIFACT_NOT_FOUND_ERROR:
      return artifactError("SESSION_NOT_FOUND", "Upload session not found");
    default:
      return artifactError("INTERNAL_ERROR", "Failed to access artifacts");
  }
}

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const ARTIFACT_UPLOAD_SESSION_TTL_MS = 60 * 60 * 1000;
