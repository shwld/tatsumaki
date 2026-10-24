import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type {
  ArtifactError,
  ArtifactErrorCode,
} from "../../../application/usecases/artifacts/errors";
import type {
  Artifact,
  ArtifactFile,
  ArtifactUploadSession,
  ArtifactVersion,
} from "../../../domain/entities/artifact";
import type { Env } from "../../../index";

export const STATUS_BY_CODE: Record<ArtifactErrorCode, ContentfulStatusCode> = {
  INVALID_REQUEST: 400,
  EMPTY_MANIFEST: 400,
  INVALID_PATH: 400,
  DUPLICATE_PATH: 400,
  SENSITIVE_FILE: 400,
  INVALID_SIZE: 400,
  INVALID_SHA256: 400,
  INVALID_ENTRYPOINT: 400,
  FORBIDDEN: 403,
  ARTIFACT_NOT_FOUND: 404,
  VERSION_NOT_FOUND: 404,
  FILE_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  BASE_VERSION_CONFLICT: 409,
  PUBLISH_CONFLICT: 409,
  SESSION_NOT_PENDING: 409,
  UPLOAD_INCOMPLETE: 409,
  SESSION_EXPIRED: 410,
  TOO_MANY_FILES: 413,
  FILE_TOO_LARGE: 413,
  TOTAL_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  IDEMPOTENCY_KEY_REUSED: 422,
  TREE_DIGEST_MISMATCH: 422,
  FILE_NOT_IN_MANIFEST: 422,
  FILE_SIZE_MISMATCH: 422,
  FILE_DIGEST_MISMATCH: 422,
  STORAGE_ERROR: 500,
  INTERNAL_ERROR: 500,
};

export function artifactErrorResponse(c: Context<Env>, error: ArtifactError) {
  return c.json(
    { error: error.message, code: error.code },
    STATUS_BY_CODE[error.code],
  );
}

export function toArtifactResponse(artifact: Artifact) {
  const { __typename: _typename, ...rest } = artifact;
  return rest;
}

export function toArtifactVersionResponse(version: ArtifactVersion) {
  const { __typename: _typename, ...rest } = version;
  return rest;
}

export function toArtifactFileResponse(file: ArtifactFile) {
  return {
    path: file.path,
    size: file.size,
    sha256: file.sha256,
    contentType: file.contentType,
  };
}

export function toUploadSessionResponse(
  session: ArtifactUploadSession,
  uploadedPaths: string[],
) {
  return {
    noop: false as const,
    sessionId: session.id,
    artifactId: session.artifactId,
    baseVersion: session.baseVersion,
    status: session.status,
    expiresAt: session.expiresAt,
    uploadedPaths,
  };
}
