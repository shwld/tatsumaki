import { err, ok, type Result } from "neverthrow";
import { canonicalizeArtifactPath } from "../../../domain/artifacts/canonical-path";
import { deriveArtifactBlobKey } from "../../../domain/artifacts/object-key";
import type {
  Artifact,
  ArtifactVersion,
} from "../../../domain/entities/artifact";
import type {
  ArtifactRepository,
  ArtifactVersionDetail,
} from "../../../domain/repositories/artifact-repository";
import type {
  ArtifactObjectStore,
  StoredArtifactObject,
} from "../../ports/artifact-object-store";
import {
  artifactError,
  fromRepositoryError,
  type ArtifactError,
} from "./errors";
import { normalizeArtifactTitle } from "./create-artifact-upload";

const notFound = () =>
  artifactError("ARTIFACT_NOT_FOUND", "Artifact not found");

export async function listArtifacts(
  repository: ArtifactRepository,
  input: { projectId: string; archived: boolean },
): Promise<Result<Artifact[], ArtifactError>> {
  const result = await repository.listByProject(input.projectId, {
    archived: input.archived,
  });
  if (result.isErr()) return err(fromRepositoryError(result.error));
  return ok(result.value);
}

export async function getArtifact(
  repository: ArtifactRepository,
  input: { projectId: string; artifactId: string },
): Promise<
  Result<
    { artifact: Artifact; latest: ArtifactVersionDetail | null },
    ArtifactError
  >
> {
  const artifact = await repository.findById(input.projectId, input.artifactId);
  if (artifact.isErr()) return err(fromRepositoryError(artifact.error));
  if (!artifact.value) return err(notFound());

  let latest: ArtifactVersionDetail | null = null;
  if (artifact.value.latestVersion !== null) {
    const detail = await repository.findVersion(
      input.projectId,
      input.artifactId,
      artifact.value.latestVersion,
    );
    if (detail.isErr()) return err(fromRepositoryError(detail.error));
    latest = detail.value;
  }
  return ok({ artifact: artifact.value, latest });
}

export async function listArtifactVersions(
  repository: ArtifactRepository,
  input: { projectId: string; artifactId: string },
): Promise<Result<ArtifactVersion[], ArtifactError>> {
  const artifact = await repository.findById(input.projectId, input.artifactId);
  if (artifact.isErr()) return err(fromRepositoryError(artifact.error));
  if (!artifact.value) return err(notFound());

  const versions = await repository.listVersions(
    input.projectId,
    input.artifactId,
  );
  if (versions.isErr()) return err(fromRepositoryError(versions.error));
  return ok(versions.value);
}

export async function getArtifactVersion(
  repository: ArtifactRepository,
  input: { projectId: string; artifactId: string; version: number },
): Promise<Result<ArtifactVersionDetail, ArtifactError>> {
  const detail = await repository.findVersion(
    input.projectId,
    input.artifactId,
    input.version,
  );
  if (detail.isErr()) return err(fromRepositoryError(detail.error));
  if (!detail.value) {
    return err(artifactError("VERSION_NOT_FOUND", "Version not found"));
  }
  return ok(detail.value);
}

export async function getArtifactFileContent(
  repository: ArtifactRepository,
  objectStore: ArtifactObjectStore,
  input: {
    projectId: string;
    artifactId: string;
    version: number;
    /** Path exactly as it appears in the URL (still percent-encoded). */
    rawPath: string;
  },
): Promise<
  Result<
    { path: string; contentType: string; object: StoredArtifactObject },
    ArtifactError
  >
> {
  const detail = await getArtifactVersion(repository, input);
  if (detail.isErr()) return err(detail.error);

  const path = canonicalizeArtifactPath(input.rawPath);
  const file = path.isOk()
    ? detail.value.files.find((item) => item.path === path.value)
    : undefined;
  if (!file) return err(artifactError("FILE_NOT_FOUND", "File not found"));

  let object: StoredArtifactObject | null;
  try {
    object = await objectStore.get(
      deriveArtifactBlobKey({
        projectId: input.projectId,
        artifactId: input.artifactId,
        sha256: file.sha256,
      }),
    );
  } catch {
    return err(artifactError("STORAGE_ERROR", "Failed to read the file"));
  }
  if (!object) return err(artifactError("FILE_NOT_FOUND", "File not found"));

  return ok({ path: file.path, contentType: file.contentType, object });
}

export async function updateArtifactMetadata(
  repository: ArtifactRepository,
  input: {
    projectId: string;
    artifactId: string;
    title?: string;
    archived?: boolean;
  },
): Promise<Result<Artifact, ArtifactError>> {
  let title: string | undefined;
  if (input.title !== undefined) {
    const normalized = normalizeArtifactTitle(input.title);
    if (normalized.isErr()) return err(normalized.error);
    title = normalized.value;
  }
  if (title === undefined && input.archived === undefined) {
    return err(artifactError("INVALID_REQUEST", "Nothing to update"));
  }

  const result = await repository.updateMetadata(
    input.projectId,
    input.artifactId,
    { title, archived: input.archived },
  );
  if (result.isErr()) {
    return err(
      result.error === "ARTIFACT_NOT_FOUND_ERROR"
        ? notFound()
        : fromRepositoryError(result.error),
    );
  }
  return ok(result.value);
}
