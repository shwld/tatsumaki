import { err, ok, type Result } from "neverthrow";
import { ARTIFACT_LIMITS } from "../entities/artifact";
import type { ArtifactManifestEntry } from "../entities/artifact";
import {
  findCaseInsensitiveDuplicates,
  validateArtifactPath,
} from "./canonical-path";
import { artifactContentTypeForPath } from "./content-type";
import { sha256Hex } from "./sha256";
import { isSensitiveArtifactPath } from "./sensitive-path";

export type ArtifactManifestFileInput = {
  path: string;
  size: number;
  sha256: string;
};

export type ArtifactManifestErrorCode =
  | "EMPTY_MANIFEST"
  | "TOO_MANY_FILES"
  | "FILE_TOO_LARGE"
  | "TOTAL_TOO_LARGE"
  | "INVALID_PATH"
  | "DUPLICATE_PATH"
  | "SENSITIVE_FILE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INVALID_SIZE"
  | "INVALID_SHA256"
  | "INVALID_ENTRYPOINT"
  | "TREE_DIGEST_MISMATCH";

export type ArtifactManifestError = {
  code: ArtifactManifestErrorCode;
  message: string;
};

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const textEncoder = new TextEncoder();

function compareUtf8(a: string, b: string): number {
  const left = textEncoder.encode(a);
  const right = textEncoder.encode(b);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] as number) - (right[index] as number);
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}

/**
 * sha256 over "{path}\0{size}\0{sha256}\n" for every file, ordered by the
 * UTF-8 bytes of the path. The CLI must compute the same value.
 */
export async function computeArtifactTreeDigest(
  files: readonly ArtifactManifestFileInput[],
): Promise<string> {
  const lines = [...files]
    .sort((a, b) => compareUtf8(a.path, b.path))
    .map((file) => `${file.path}\0${file.size}\0${file.sha256}\n`);
  return sha256Hex(lines.join(""));
}

function fail(
  code: ArtifactManifestErrorCode,
  message: string,
): Result<never, ArtifactManifestError> {
  return err({ code, message });
}

/**
 * Validates an upload manifest and returns the entries with the server-decided
 * content type. Nothing is skipped silently: any rejected file fails the whole
 * manifest.
 */
export async function validateArtifactManifest(input: {
  files: readonly ArtifactManifestFileInput[];
  entrypoint: string;
  treeDigest: string;
}): Promise<Result<ArtifactManifestEntry[], ArtifactManifestError>> {
  const { files } = input;
  if (files.length === 0) {
    return fail("EMPTY_MANIFEST", "Manifest must contain at least one file");
  }
  if (files.length > ARTIFACT_LIMITS.fileCount) {
    return fail("TOO_MANY_FILES", "Too many files");
  }

  const entries: ArtifactManifestEntry[] = [];
  let totalBytes = 0;
  for (const file of files) {
    const path = validateArtifactPath(file.path);
    if (path.isErr()) {
      return fail("INVALID_PATH", `Invalid path "${file.path}": ${path.error}`);
    }
    if (isSensitiveArtifactPath(file.path)) {
      return fail(
        "SENSITIVE_FILE",
        `Sensitive file is not allowed: ${file.path}`,
      );
    }
    if (!Number.isSafeInteger(file.size) || file.size < 0) {
      return fail("INVALID_SIZE", `Invalid size for ${file.path}`);
    }
    if (file.size > ARTIFACT_LIMITS.fileBytes) {
      return fail("FILE_TOO_LARGE", `File is too large: ${file.path}`);
    }
    if (!SHA256_PATTERN.test(file.sha256)) {
      return fail("INVALID_SHA256", `Invalid sha256 for ${file.path}`);
    }
    const contentType = artifactContentTypeForPath(file.path);
    if (!contentType) {
      return fail(
        "UNSUPPORTED_MEDIA_TYPE",
        `File type is not allowed: ${file.path}`,
      );
    }
    totalBytes += file.size;
    entries.push({
      path: file.path,
      size: file.size,
      sha256: file.sha256,
      contentType,
    });
  }

  if (totalBytes > ARTIFACT_LIMITS.totalBytes) {
    return fail("TOTAL_TOO_LARGE", "Total size is too large");
  }

  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    return fail("DUPLICATE_PATH", "Duplicate path in manifest");
  }
  if (findCaseInsensitiveDuplicates(paths).length > 0) {
    return fail("DUPLICATE_PATH", "Paths differing only by case");
  }

  if (
    !paths.includes(input.entrypoint) ||
    !input.entrypoint.toLowerCase().endsWith(".html")
  ) {
    return fail(
      "INVALID_ENTRYPOINT",
      "Entrypoint must be an .html file included in the manifest",
    );
  }

  if ((await computeArtifactTreeDigest(files)) !== input.treeDigest) {
    return fail("TREE_DIGEST_MISMATCH", "Tree digest does not match the files");
  }

  return ok(entries);
}

export async function computeUploadRequestHash(input: {
  artifactId: string | null;
  baseVersion: number | null;
  treeDigest: string;
  entrypoint: string;
  title: string;
}): Promise<string> {
  return sha256Hex(
    JSON.stringify([
      input.artifactId,
      input.baseVersion,
      input.treeDigest,
      input.entrypoint,
      input.title,
    ]),
  );
}
