import { err, ok, type Result } from "neverthrow";
import type { ArtifactRepository } from "../../../domain/repositories/artifact-repository";
import {
  artifactError,
  fromRepositoryError,
  type ArtifactError,
} from "./errors";

export async function finalizeArtifactUpload(
  repository: ArtifactRepository,
  input: { projectId: string; userId: string; sessionId: string },
): Promise<Result<{ artifactId: string; version: number }, ArtifactError>> {
  const found = await repository.findUploadSession(
    input.projectId,
    input.sessionId,
    input.userId,
  );
  if (found.isErr()) return err(fromRepositoryError(found.error));
  const session = found.value;
  if (!session) {
    return err(artifactError("SESSION_NOT_FOUND", "Upload session not found"));
  }

  if (
    session.status === "expired" ||
    (session.status === "pending" &&
      new Date(session.expiresAt).getTime() <= Date.now())
  ) {
    return err(artifactError("SESSION_EXPIRED", "Upload session has expired"));
  }

  if (session.status === "pending") {
    const uploaded = await repository.listUploadedPaths(session.id);
    if (uploaded.isErr()) return err(fromRepositoryError(uploaded.error));
    const uploadedSet = new Set(uploaded.value);
    const missing = session.manifest.filter(
      (entry) => !uploadedSet.has(entry.path),
    );
    if (missing.length > 0) {
      return err(
        artifactError(
          "UPLOAD_INCOMPLETE",
          `${missing.length} file(s) have not been uploaded`,
        ),
      );
    }
  }

  const published = await repository.publishUploadSession({
    projectId: input.projectId,
    sessionId: input.sessionId,
    createdBy: input.userId,
  });
  if (published.isErr()) return err(fromRepositoryError(published.error));
  return ok(published.value);
}
