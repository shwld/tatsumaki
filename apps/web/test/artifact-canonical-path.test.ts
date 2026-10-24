import { describe, expect, it } from "vitest";
import bodyFixtures from "./fixtures/artifact-body-paths.json";
import fixtures from "./fixtures/artifact-paths.json";
import {
  ARTIFACT_MAX_PATH_BYTES,
  canonicalizeArtifactPath,
  findCaseInsensitiveDuplicates,
  validateArtifactPath,
} from "../src/domain/artifacts/canonical-path";

describe("canonicalizeArtifactPath", () => {
  it.each(fixtures.valid)("accepts $input", ({ input, canonical }) => {
    expect(canonicalizeArtifactPath(input)._unsafeUnwrap()).toBe(canonical);
  });

  it.each(fixtures.invalid)("rejects $input", ({ input, error }) => {
    expect(canonicalizeArtifactPath(input)._unsafeUnwrapErr()).toBe(error);
  });

  it("measures the byte limit on the NFC UTF-8 form", () => {
    const atLimit = "あ".repeat(Math.floor(ARTIFACT_MAX_PATH_BYTES / 3));
    expect(canonicalizeArtifactPath(atLimit).isOk()).toBe(true);
    expect(canonicalizeArtifactPath(`${atLimit}あ`)._unsafeUnwrapErr()).toBe(
      "PATH_TOO_LONG",
    );
  });

  it("decodes percent escapes exactly once", () => {
    expect(canonicalizeArtifactPath("%252e%252e/a")._unsafeUnwrap()).toBe(
      "%2e%2e/a",
    );
  });
});

describe("findCaseInsensitiveDuplicates", () => {
  it("reports paths that differ only by case", () => {
    expect(
      findCaseInsensitiveDuplicates([
        "a/Index.html",
        "a/index.html",
        "b",
      ]).sort(),
    ).toEqual(["a/Index.html", "a/index.html"]);
  });

  it("treats NFC-equivalent forms as one path after canonicalization", () => {
    const nfc = canonicalizeArtifactPath("é.txt")._unsafeUnwrap();
    const nfd = canonicalizeArtifactPath("é.txt")._unsafeUnwrap();
    expect(findCaseInsensitiveDuplicates([nfc, nfd])).toHaveLength(1);
  });

  it("returns nothing for distinct paths", () => {
    expect(findCaseInsensitiveDuplicates(["a", "b"])).toEqual([]);
  });
});

describe("validateArtifactPath (shared body-path fixture)", () => {
  it.each(bodyFixtures.valid)("accepts %j", (input) => {
    expect(validateArtifactPath(input)._unsafeUnwrap()).toBe(input);
  });

  it.each(bodyFixtures.invalid)("rejects %j", ({ input, error }) => {
    expect(validateArtifactPath(input)._unsafeUnwrapErr()).toBe(error);
  });

  it.each(
    bodyFixtures.validC1Control,
  )("does not treat the C1 control character in %j as forbidden", (input) => {
    expect(validateArtifactPath(input).isOk()).toBe(true);
  });

  it("limits the path to the shared UTF-8 byte length", () => {
    const atLimit = "a".repeat(bodyFixtures.maxBytes);
    expect(validateArtifactPath(atLimit).isOk()).toBe(true);
    expect(validateArtifactPath(`${atLimit}a`)._unsafeUnwrapErr()).toBe(
      "PATH_TOO_LONG",
    );
  });
});
