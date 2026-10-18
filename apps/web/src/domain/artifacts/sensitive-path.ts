const SENSITIVE_EXTENSIONS = new Set(["pem", "key", "p12", "pfx", "crt"]);
const SENSITIVE_FILE_NAMES = new Set([".netrc", ".npmrc", ".envrc", ".pypirc"]);
const SENSITIVE_NAME_FRAGMENTS = ["secret", "credential", "token"];
// Directories whose whole content is credential material.
const SENSITIVE_DIRECTORIES = new Set([
  ".git",
  ".ssh",
  ".gnupg",
  ".aws",
  ".kube",
]);

/**
 * Mirrors scripts/config-guard.sh (SENSITIVE_FILE_PATTERNS and
 * SENSITIVE_FILE_REGEX) so the server rejects at least what the CLI is
 * expected to reject. It is deliberately a little stricter: directories such
 * as .ssh/ and .aws/ are rejected as a whole. Matching is case-insensitive.
 */
export function isSensitiveArtifactPath(path: string): boolean {
  const segments = path.toLowerCase().split("/");
  const fileName = segments[segments.length - 1] ?? "";
  const directories = segments.slice(0, -1);

  if (directories.some((segment) => SENSITIVE_DIRECTORIES.has(segment))) {
    return true;
  }
  if (fileName === ".git") return true;

  if (fileName === "config.json" && directories.at(-1) === ".docker") {
    return true;
  }
  if (fileName === ".env" || fileName.startsWith(".env.")) return true;
  if (SENSITIVE_FILE_NAMES.has(fileName)) return true;
  if (SENSITIVE_NAME_FRAGMENTS.some((part) => fileName.includes(part))) {
    return true;
  }

  const dot = fileName.lastIndexOf(".");
  return dot >= 0 && SENSITIVE_EXTENSIONS.has(fileName.slice(dot + 1));
}
