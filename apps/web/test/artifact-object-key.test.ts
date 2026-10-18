import { describe, expect, it } from "vitest";
import {
  artifactBlobPrefix,
  deriveArtifactBlobKey,
} from "../src/domain/artifacts/object-key";

const projectId = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TM";
const artifactId = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TN";
const sha256 = "a".repeat(64);

describe("deriveArtifactBlobKey", () => {
  it("derives the key from project, artifact and sha256 only", () => {
    expect(deriveArtifactBlobKey({ projectId, artifactId, sha256 })).toBe(
      `artifacts/${projectId}/${artifactId}/blobs/${sha256}`,
    );
    expect(
      deriveArtifactBlobKey({ projectId, artifactId, sha256 }).startsWith(
        artifactBlobPrefix(projectId, artifactId),
      ),
    ).toBe(true);
  });

  it.each([
    "../x",
    "A".repeat(64),
    "a".repeat(63),
    `${"a".repeat(63)}/`,
    "index.html",
  ])("rejects non-sha256 value %s", (value) => {
    expect(() =>
      deriveArtifactBlobKey({ projectId, artifactId, sha256: value }),
    ).toThrow();
  });

  it("rejects ids that are not ULIDs", () => {
    expect(() =>
      deriveArtifactBlobKey({ projectId: "../other", artifactId, sha256 }),
    ).toThrow();
    expect(() =>
      deriveArtifactBlobKey({ projectId, artifactId: "a/b", sha256 }),
    ).toThrow();
  });
});
