import type { ArtifactContentSigningKeys } from "../../../application/services/artifact-content-token";

/** Shorter keys are treated as not configured. */
const MIN_KEY_LENGTH = 32;

export function signingKeysFrom(env: {
  ARTIFACT_CONTENT_SIGNING_KEY?: string;
  ARTIFACT_CONTENT_SIGNING_KEY_PREVIOUS?: string;
}): ArtifactContentSigningKeys | null {
  const current = env.ARTIFACT_CONTENT_SIGNING_KEY;
  if (!current || current.length < MIN_KEY_LENGTH) return null;
  const previous = env.ARTIFACT_CONTENT_SIGNING_KEY_PREVIOUS;
  return {
    current,
    previous:
      previous && previous.length >= MIN_KEY_LENGTH ? previous : undefined,
  };
}
