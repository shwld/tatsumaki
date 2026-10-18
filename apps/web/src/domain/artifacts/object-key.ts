const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

function assertUlid(label: string, value: string): void {
  if (!ULID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label} for artifact object key`);
  }
}

export function artifactBlobPrefix(
  projectId: string,
  artifactId: string,
): string {
  assertUlid("projectId", projectId);
  assertUlid("artifactId", artifactId);
  return `artifacts/${projectId}/${artifactId}/blobs/`;
}

/** The only place an R2 key is derived; keys never come from request paths. */
export function deriveArtifactBlobKey(input: {
  projectId: string;
  artifactId: string;
  sha256: string;
}): string {
  if (!SHA256_HEX_PATTERN.test(input.sha256)) {
    throw new Error("Invalid sha256 for artifact object key");
  }
  return `${artifactBlobPrefix(input.projectId, input.artifactId)}${input.sha256}`;
}
