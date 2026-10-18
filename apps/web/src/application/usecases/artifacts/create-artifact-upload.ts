import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import {
  computeUploadRequestHash,
  validateArtifactManifest,
  type ArtifactManifestFileInput,
} from "../../../domain/artifacts/manifest";
import type {
  Artifact,
  ArtifactUploadSession,
} from "../../../domain/entities/artifact";
import type { ProjectMemberRole } from "../../../domain/entities/project-member";
import type { ArtifactRepository } from "../../../domain/repositories/artifact-repository";
import {
  ARTIFACT_UPLOAD_SESSION_TTL_MS,
  ULID_PATTERN,
  artifactError,
  fromRepositoryError,
  type ArtifactError,
} from "./errors";

const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;
const MAX_TITLE_LENGTH = 200;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type CreateArtifactUploadInput = {
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  idempotencyKey: string | undefined;
  artifactId?: string;
  title?: string;
  baseVersion?: number;
  entrypoint: string;
  treeDigest: string;
  files: ArtifactManifestFileInput[];
};

export type CreateArtifactUploadResult =
  | { kind: "session"; session: ArtifactUploadSession; uploadedPaths: string[] }
  | { kind: "noop"; artifact: Artifact; version: number };

export function normalizeArtifactTitle(
  title: string | undefined,
): Result<string, ArtifactError> {
  const normalized = title?.trim() ?? "";
  if (
    normalized.length === 0 ||
    normalized.length > MAX_TITLE_LENGTH ||
    CONTROL_CHARACTERS.test(normalized)
  ) {
    return err(
      artifactError(
        "INVALID_REQUEST",
        `title must be 1-${MAX_TITLE_LENGTH} characters without control characters`,
      ),
    );
  }
  return ok(normalized);
}

/**
 * Evaluation order (ADR-0010 §6): input validation, role authorization,
 * idempotent replay, base version conflict, then the unchanged-tree no-op.
 */
export async function createArtifactUpload(
  repository: ArtifactRepository,
  input: CreateArtifactUploadInput,
): Promise<Result<CreateArtifactUploadResult, ArtifactError>> {
  const isUpdate = input.artifactId !== undefined;

  if (
    input.idempotencyKey === undefined ||
    !IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)
  ) {
    return err(
      artifactError(
        "INVALID_REQUEST",
        "Idempotency-Key header is required (1-255 printable characters)",
      ),
    );
  }
  if (isUpdate) {
    if (!ULID_PATTERN.test(input.artifactId as string)) {
      return err(artifactError("INVALID_REQUEST", "artifactId is invalid"));
    }
    if (
      input.baseVersion === undefined ||
      !Number.isSafeInteger(input.baseVersion) ||
      input.baseVersion < 1
    ) {
      return err(
        artifactError(
          "INVALID_REQUEST",
          "baseVersion is required when updating an artifact",
        ),
      );
    }
  } else if (input.baseVersion !== undefined) {
    return err(
      artifactError(
        "INVALID_REQUEST",
        "baseVersion is only allowed when artifactId is given",
      ),
    );
  }

  let newTitle = "";
  if (!isUpdate) {
    const title = normalizeArtifactTitle(input.title);
    if (title.isErr()) return err(title.error);
    newTitle = title.value;
  }

  const manifest = await validateArtifactManifest({
    files: input.files,
    entrypoint: input.entrypoint,
    treeDigest: input.treeDigest,
  });
  if (manifest.isErr()) return err(manifest.error);

  if (input.role === "viewer") {
    return err(artifactError("FORBIDDEN", "Viewers cannot upload artifacts"));
  }

  const requestHash = await computeUploadRequestHash({
    artifactId: input.artifactId ?? null,
    baseVersion: input.baseVersion ?? null,
    treeDigest: input.treeDigest,
    entrypoint: input.entrypoint,
    title: isUpdate ? "" : newTitle,
  });

  const existing = await repository.findUploadSessionByIdempotencyKey(
    input.projectId,
    input.userId,
    input.idempotencyKey,
  );
  if (existing.isErr()) return err(fromRepositoryError(existing.error));
  if (existing.value) {
    if (existing.value.requestHash !== requestHash) {
      return err(
        artifactError(
          "IDEMPOTENCY_KEY_REUSED",
          "Idempotency-Key was already used with a different request",
        ),
      );
    }
    return withUploadedPaths(repository, existing.value);
  }

  let title = newTitle;
  if (isUpdate) {
    const artifact = await repository.findById(
      input.projectId,
      input.artifactId as string,
    );
    if (artifact.isErr()) return err(fromRepositoryError(artifact.error));
    if (!artifact.value) {
      return err(artifactError("ARTIFACT_NOT_FOUND", "Artifact not found"));
    }
    if (artifact.value.latestVersion !== input.baseVersion) {
      return err(
        artifactError(
          "BASE_VERSION_CONFLICT",
          `baseVersion ${input.baseVersion} is not the latest version`,
        ),
      );
    }
    title = artifact.value.title;

    const latest = await repository.findVersion(
      input.projectId,
      artifact.value.id,
      artifact.value.latestVersion,
    );
    if (latest.isErr()) return err(fromRepositoryError(latest.error));
    if (
      latest.value?.version.treeDigest === input.treeDigest &&
      latest.value.version.entrypoint === input.entrypoint
    ) {
      return ok({
        kind: "noop",
        artifact: artifact.value,
        version: latest.value.version.version,
      });
    }
  }

  const created = await repository.createUploadSession({
    id: ulid(),
    projectId: input.projectId,
    artifactId: input.artifactId ?? ulid(),
    baseVersion: input.baseVersion ?? null,
    title,
    entrypoint: input.entrypoint,
    treeDigest: input.treeDigest,
    manifest: manifest.value,
    requestHash,
    idempotencyKey: input.idempotencyKey,
    expiresAt: new Date(
      Date.now() + ARTIFACT_UPLOAD_SESSION_TTL_MS,
    ).toISOString(),
    createdBy: input.userId,
  });
  if (created.isErr()) return err(fromRepositoryError(created.error));

  return withUploadedPaths(repository, created.value);
}

async function withUploadedPaths(
  repository: ArtifactRepository,
  session: ArtifactUploadSession,
): Promise<Result<CreateArtifactUploadResult, ArtifactError>> {
  const paths = await repository.listUploadedPaths(session.id);
  if (paths.isErr()) return err(fromRepositoryError(paths.error));
  return ok({ kind: "session", session, uploadedPaths: paths.value });
}
