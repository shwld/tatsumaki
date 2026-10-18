import { describe, expect, it } from "vitest";
import treeDigestFixture from "./fixtures/artifact-tree-digest.json";
import { artifactContentTypeForPath } from "../src/domain/artifacts/content-type";
import {
  computeArtifactTreeDigest,
  computeUploadRequestHash,
  validateArtifactManifest,
  type ArtifactManifestFileInput,
} from "../src/domain/artifacts/manifest";
import { sha256Hex } from "../src/domain/artifacts/sha256";
import { isSensitiveArtifactPath } from "../src/domain/artifacts/sensitive-path";
import { validateArtifactPath } from "../src/domain/artifacts/canonical-path";
import { ARTIFACT_LIMITS } from "../src/domain/entities/artifact";

const SHA = "a".repeat(64);

async function manifestFor(
  files: ArtifactManifestFileInput[],
  entrypoint = "index.html",
) {
  return {
    files,
    entrypoint,
    treeDigest: await computeArtifactTreeDigest(files),
  };
}

const indexFile = { path: "index.html", size: 1, sha256: SHA };

describe("computeArtifactTreeDigest", () => {
  it("matches the shared fixture regardless of input order", async () => {
    const files = [...treeDigestFixture.files].reverse();
    expect(await computeArtifactTreeDigest(files)).toBe(
      treeDigestFixture.treeDigest,
    );
    expect(await computeArtifactTreeDigest(treeDigestFixture.files)).toBe(
      treeDigestFixture.treeDigest,
    );
  });
});

describe("validateArtifactManifest", () => {
  it("returns entries with the server-decided content type", async () => {
    const result = await validateArtifactManifest(
      await manifestFor([
        indexFile,
        { path: "assets/app.js", size: 2, sha256: SHA },
        { path: "empty.txt", size: 0, sha256: SHA },
      ]),
    );

    expect(
      result._unsafeUnwrap().map((entry) => [entry.path, entry.contentType]),
    ).toEqual([
      ["index.html", "text/html; charset=utf-8"],
      ["assets/app.js", "text/javascript; charset=utf-8"],
      ["empty.txt", "text/plain; charset=utf-8"],
    ]);
  });

  const rejects: Array<[string, ArtifactManifestFileInput[], string]> = [
    [
      "path traversal",
      [indexFile, { path: "../x.js", size: 1, sha256: SHA }],
      "INVALID_PATH",
    ],
    [
      "non-NFC path",
      [indexFile, { path: "é.txt", size: 1, sha256: SHA }],
      "INVALID_PATH",
    ],
    [
      "case-only duplicate",
      [indexFile, { path: "Index.html", size: 1, sha256: SHA }],
      "DUPLICATE_PATH",
    ],
    ["exact duplicate", [indexFile, indexFile], "DUPLICATE_PATH"],
    [
      "sensitive file",
      [indexFile, { path: ".env", size: 1, sha256: SHA }],
      "SENSITIVE_FILE",
    ],
    [
      "unknown extension",
      [indexFile, { path: "a.exe", size: 1, sha256: SHA }],
      "UNSUPPORTED_MEDIA_TYPE",
    ],
    [
      "pdf",
      [indexFile, { path: "a.pdf", size: 1, sha256: SHA }],
      "UNSUPPORTED_MEDIA_TYPE",
    ],
    [
      "xml",
      [indexFile, { path: "a.xml", size: 1, sha256: SHA }],
      "UNSUPPORTED_MEDIA_TYPE",
    ],
    [
      "no extension",
      [indexFile, { path: "LICENSE", size: 1, sha256: SHA }],
      "UNSUPPORTED_MEDIA_TYPE",
    ],
    [
      "negative size",
      [indexFile, { path: "a.js", size: -1, sha256: SHA }],
      "INVALID_SIZE",
    ],
    [
      "fractional size",
      [indexFile, { path: "a.js", size: 1.5, sha256: SHA }],
      "INVALID_SIZE",
    ],
    [
      "file over 25 MiB",
      [
        indexFile,
        { path: "a.js", size: ARTIFACT_LIMITS.fileBytes + 1, sha256: SHA },
      ],
      "FILE_TOO_LARGE",
    ],
    [
      "upper-case sha256",
      [indexFile, { path: "a.js", size: 1, sha256: "A".repeat(64) }],
      "INVALID_SHA256",
    ],
  ];

  it.each(rejects)("%s", async (_name, files, code) => {
    const result = await validateArtifactManifest(await manifestFor(files));
    expect(result._unsafeUnwrapErr().code).toBe(code);
  });

  it("accepts a literal percent sequence in a path without decoding it", async () => {
    const result = await validateArtifactManifest(
      await manifestFor([
        indexFile,
        { path: "a%2Fb.txt", size: 1, sha256: SHA },
      ]),
    );

    expect(result._unsafeUnwrap().map((entry) => entry.path)).toContain(
      "a%2Fb.txt",
    );
  });

  it("rejects more than 1,000 files", async () => {
    const files = Array.from(
      { length: ARTIFACT_LIMITS.fileCount + 1 },
      (_, i) => ({
        path: `f${i}.txt`,
        size: 1,
        sha256: SHA,
      }),
    );
    files[0] = indexFile;
    const result = await validateArtifactManifest(await manifestFor(files));
    expect(result._unsafeUnwrapErr().code).toBe("TOO_MANY_FILES");
  });

  it("rejects a total over 50 MiB", async () => {
    const half = ARTIFACT_LIMITS.fileBytes;
    const files = [
      { path: "index.html", size: half, sha256: SHA },
      { path: "a.js", size: half, sha256: SHA },
      { path: "b.js", size: 1, sha256: SHA },
    ];
    const result = await validateArtifactManifest(await manifestFor(files));
    expect(result._unsafeUnwrapErr().code).toBe("TOTAL_TOO_LARGE");
  });

  it("rejects an empty manifest", async () => {
    const result = await validateArtifactManifest(await manifestFor([]));
    expect(result._unsafeUnwrapErr().code).toBe("EMPTY_MANIFEST");
  });

  it.each([
    ["missing from the manifest", "other.html"],
    ["not html", "assets/app.js"],
  ])("rejects an entrypoint that is %s", async (_name, entrypoint) => {
    const result = await validateArtifactManifest(
      await manifestFor(
        [indexFile, { path: "assets/app.js", size: 1, sha256: SHA }],
        entrypoint,
      ),
    );
    expect(result._unsafeUnwrapErr().code).toBe("INVALID_ENTRYPOINT");
  });

  it("rejects a tree digest that does not match the files", async () => {
    const input = await manifestFor([indexFile]);
    const result = await validateArtifactManifest({
      ...input,
      treeDigest: "0".repeat(64),
    });
    expect(result._unsafeUnwrapErr().code).toBe("TREE_DIGEST_MISMATCH");
  });
});

describe("validateArtifactPath", () => {
  it("does not percent-decode", () => {
    expect(validateArtifactPath("100%25.txt")._unsafeUnwrap()).toBe(
      "100%25.txt",
    );
  });
});

describe("artifactContentTypeForPath", () => {
  it("is case-insensitive and rejects dotfiles without an extension", () => {
    expect(artifactContentTypeForPath("A/B.PNG")).toBe("image/png");
    expect(artifactContentTypeForPath(".js")).toBeNull();
    expect(artifactContentTypeForPath("a/b")).toBeNull();
  });
});

describe("isSensitiveArtifactPath", () => {
  it.each([
    ".env",
    ".env.production",
    "config/.ENV",
    ".git/config",
    "a/.git/HEAD",
    "key.pem",
    "certs/site.CRT",
    "id.key",
    "x.p12",
    "x.pfx",
    "aws/credentials",
    "my-secret.json",
    "api-token.txt",
    ".npmrc",
    ".netrc",
    ".envrc",
    ".pypirc",
    ".docker/config.json",
    "home/.DOCKER/config.json",
    ".aws/config",
    ".ssh/config",
    ".ssh/id_ed25519",
    ".kube/config",
    ".gnupg/pubring.kbx",
  ])("flags %s", (path) => {
    expect(isSensitiveArtifactPath(path)).toBe(true);
  });

  it.each([
    "index.html",
    "assets/app.js",
    "environment.js",
    "gitignore.txt",
  ])("allows %s", (path) => {
    expect(isSensitiveArtifactPath(path)).toBe(false);
  });
});

describe("computeUploadRequestHash", () => {
  const base = {
    artifactId: null,
    baseVersion: null,
    treeDigest: SHA,
    entrypoint: "index.html",
    title: "T",
  };

  it("changes when any component changes", async () => {
    const reference = await computeUploadRequestHash(base);
    for (const change of [
      { artifactId: "x" },
      { baseVersion: 1 },
      { treeDigest: "b".repeat(64) },
      { entrypoint: "other.html" },
      { title: "U" },
    ]) {
      expect(await computeUploadRequestHash({ ...base, ...change })).not.toBe(
        reference,
      );
    }
    expect(await computeUploadRequestHash(base)).toBe(reference);
    expect(reference).toBe(
      await sha256Hex(JSON.stringify([null, null, SHA, "index.html", "T"])),
    );
  });
});
