import { err, ok, type Result } from "neverthrow";
import type { StoredArtifactObject } from "../../ports/artifact-object-store";
import type { ArtifactObjectStore } from "../../ports/artifact-object-store";
import type { ArtifactRepository } from "../../../domain/repositories/artifact-repository";
import {
  signArtifactContentToken,
  verifyArtifactContentToken,
  type ArtifactContentSigningKeys,
} from "../../services/artifact-content-token";
import {
  getArtifact,
  getArtifactFileContent,
  getArtifactVersion,
} from "./artifact-queries";
import { artifactError, type ArtifactError } from "./errors";

export async function issueArtifactPreviewToken(
  repository: ArtifactRepository,
  keys: ArtifactContentSigningKeys,
  input: {
    projectId: string;
    artifactId: string;
    version: number;
    now: Date;
  },
): Promise<
  Result<{ token: string; expiresAt: Date; entrypoint: string }, ArtifactError>
> {
  const artifact = await getArtifact(repository, input);
  if (artifact.isErr()) return err(artifact.error);

  const detail = await getArtifactVersion(repository, input);
  if (detail.isErr()) return err(detail.error);

  const signed = await signArtifactContentToken(keys, input, input.now);
  return ok({ ...signed, entrypoint: detail.value.version.entrypoint });
}

/**
 * Serves one file of the version a token is pinned to. The token is the only
 * credential; every failure is reported as the same FILE_NOT_FOUND so a
 * caller cannot distinguish a bad token from a missing file.
 */
export async function readArtifactContent(
  repository: ArtifactRepository,
  objectStore: ArtifactObjectStore,
  keys: ArtifactContentSigningKeys,
  input: { token: string; rawPath: string; now: Date },
): Promise<
  Result<{ contentType: string; object: StoredArtifactObject }, ArtifactError>
> {
  const notFound = () => err(artifactError("FILE_NOT_FOUND", "Not found"));

  const claims = await verifyArtifactContentToken(keys, input.token, input.now);
  if (!claims) return notFound();

  let rawPath = input.rawPath;
  if (rawPath === "") {
    const detail = await getArtifactVersion(repository, claims);
    if (detail.isErr()) return notFound();
    rawPath = encodeURIComponent(detail.value.version.entrypoint).replaceAll(
      "%2F",
      "/",
    );
  }

  const file = await getArtifactFileContent(repository, objectStore, {
    ...claims,
    rawPath,
  });
  if (file.isErr()) {
    return file.error.code === "STORAGE_ERROR" ? err(file.error) : notFound();
  }
  return ok({ contentType: file.value.contentType, object: file.value.object });
}
