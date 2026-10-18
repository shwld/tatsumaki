import { err, ok, type Result } from "neverthrow";

export const ARTIFACT_MAX_PATH_BYTES = 512;

export type ArtifactPathError =
  | "INVALID_PERCENT_ENCODING"
  | "EMPTY_PATH"
  | "PATH_TOO_LONG"
  | "FORBIDDEN_CHARACTER"
  | "ABSOLUTE_PATH"
  | "EMPTY_SEGMENT"
  | "DOT_SEGMENT"
  | "NOT_NFC";

const FORBIDDEN_CHARACTERS = /[\\\u0000-\u001f\u007f]/;
const textEncoder = new TextEncoder();

/**
 * Validates a path that is already a plain string (e.g. from a JSON body).
 * It is never percent-decoded and must already be NFC, so the client and the
 * server agree on the exact bytes that enter the tree digest.
 */
export function validateArtifactPath(
  path: string,
): Result<string, ArtifactPathError> {
  if (path.length === 0) return err("EMPTY_PATH");
  if (path.normalize("NFC") !== path) return err("NOT_NFC");
  if (FORBIDDEN_CHARACTERS.test(path)) return err("FORBIDDEN_CHARACTER");
  if (path.startsWith("/")) return err("ABSOLUTE_PATH");
  if (textEncoder.encode(path).length > ARTIFACT_MAX_PATH_BYTES) {
    return err("PATH_TOO_LONG");
  }

  for (const segment of path.split("/")) {
    if (segment === "") return err("EMPTY_SEGMENT");
    if (segment === "." || segment === "..") return err("DOT_SEGMENT");
  }

  return ok(path);
}

/** Canonicalizes a path taken from a URL: percent-decode once, then NFC. */
export function canonicalizeArtifactPath(
  rawPath: string,
): Result<string, ArtifactPathError> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return err("INVALID_PERCENT_ENCODING");
  }

  return validateArtifactPath(decoded.normalize("NFC"));
}

/** Returns canonical paths that collide when compared case-insensitively. */
export function findCaseInsensitiveDuplicates(
  canonicalPaths: readonly string[],
): string[] {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const path of canonicalPaths) {
    const folded = path.toLowerCase();
    const existing = seen.get(folded);
    if (existing === undefined) {
      seen.set(folded, path);
    } else {
      duplicates.add(existing);
      duplicates.add(path);
    }
  }
  return [...duplicates];
}
