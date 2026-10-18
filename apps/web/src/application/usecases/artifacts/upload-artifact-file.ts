import { err, ok, type Result } from "neverthrow";
import type { ArtifactObjectStore } from "../../ports/artifact-object-store";
import { canonicalizeArtifactPath } from "../../../domain/artifacts/canonical-path";
import { deriveArtifactBlobKey } from "../../../domain/artifacts/object-key";
import { sha256Hex } from "../../../domain/artifacts/sha256";
import type { ArtifactRepository } from "../../../domain/repositories/artifact-repository";
import {
  artifactError,
  fromRepositoryError,
  type ArtifactError,
} from "./errors";

async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array | "TOO_LARGE"> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return "TOO_LARGE";
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function uploadArtifactFile(
  repository: ArtifactRepository,
  objectStore: ArtifactObjectStore,
  input: {
    projectId: string;
    userId: string;
    sessionId: string;
    /** Path exactly as it appears in the URL (still percent-encoded). */
    rawPath: string;
    body: ReadableStream<Uint8Array> | null;
  },
): Promise<Result<{ path: string; uploadedCount: number }, ArtifactError>> {
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
  if (session.status === "published") {
    return err(
      artifactError(
        "SESSION_NOT_PENDING",
        "Upload session is already published",
      ),
    );
  }
  if (
    session.status === "expired" ||
    new Date(session.expiresAt).getTime() <= Date.now()
  ) {
    return err(artifactError("SESSION_EXPIRED", "Upload session has expired"));
  }

  const path = canonicalizeArtifactPath(input.rawPath);
  const entry = path.isOk()
    ? session.manifest.find((item) => item.path === path.value)
    : undefined;
  if (!entry) {
    return err(
      artifactError("FILE_NOT_IN_MANIFEST", "File is not part of this upload"),
    );
  }

  const bytes = await readBounded(input.body, entry.size);
  if (bytes === "TOO_LARGE" || bytes.byteLength !== entry.size) {
    return err(
      artifactError(
        "FILE_SIZE_MISMATCH",
        "File size does not match the manifest",
      ),
    );
  }
  if ((await sha256Hex(bytes)) !== entry.sha256) {
    return err(
      artifactError(
        "FILE_DIGEST_MISMATCH",
        "File sha256 does not match the manifest",
      ),
    );
  }

  try {
    await objectStore.put(
      deriveArtifactBlobKey({
        projectId: session.projectId,
        artifactId: session.artifactId,
        sha256: entry.sha256,
      }),
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
      { contentType: entry.contentType },
    );
  } catch {
    return err(artifactError("STORAGE_ERROR", "Failed to store the file"));
  }

  const recorded = await repository.recordUploadedFile(session.id, entry.path);
  if (recorded.isErr()) return err(fromRepositoryError(recorded.error));
  const count = await repository.countUploadedFiles(session.id);
  if (count.isErr()) return err(fromRepositoryError(count.error));

  return ok({ path: entry.path, uploadedCount: count.value });
}
