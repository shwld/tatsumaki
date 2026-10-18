const SENSITIVE_EXTENSIONS = new Set(["pem", "key", "p12", "pfx", "crt"]);
const SENSITIVE_FILE_NAMES = new Set([".netrc", ".npmrc", ".envrc"]);
const SENSITIVE_NAME_FRAGMENTS = ["secret", "credential", "token"];

/**
 * Mirrors the rules in scripts/config-guard.sh so the server rejects what the
 * CLI is expected to reject. Matching is case-insensitive.
 */
export function isSensitiveArtifactPath(path: string): boolean {
  const segments = path.toLowerCase().split("/");
  if (segments.includes(".git")) return true;

  const fileName = segments[segments.length - 1] ?? "";
  if (fileName === ".env" || fileName.startsWith(".env.")) return true;
  if (SENSITIVE_FILE_NAMES.has(fileName)) return true;
  if (SENSITIVE_NAME_FRAGMENTS.some((part) => fileName.includes(part))) {
    return true;
  }

  const dot = fileName.lastIndexOf(".");
  return dot >= 0 && SENSITIVE_EXTENSIONS.has(fileName.slice(dot + 1));
}
