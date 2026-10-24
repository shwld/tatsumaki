import { SELF } from "cloudflare:test";
import { computeArtifactTreeDigest } from "../../src/domain/artifacts/manifest";
import { sha256Hex } from "../../src/domain/artifacts/sha256";
import { issueAccessToken } from "./cli-auth";

export type TestFile = { path: string; content: string };
export type TestIdentity = { sub: string; email: string };

let keyCounter = 0;

/** Publishes `files` through the CLI API and returns the artifact id and version. */
export async function publishTestArtifact(
  projectId: string,
  files: TestFile[],
  identity: TestIdentity,
  options: { artifactId?: string; baseVersion?: number } = {},
): Promise<{ artifactId: string; version: number }> {
  const token = await issueAccessToken(identity);
  const base = `https://localhost/programmatic-api/v1/projects/${projectId}`;
  const headers = { authorization: `Bearer ${token}` };

  const entries = await Promise.all(
    files.map(async (file) => {
      const bytes = new TextEncoder().encode(file.content);
      return {
        path: file.path,
        size: bytes.byteLength,
        sha256: await sha256Hex(bytes),
      };
    }),
  );
  const created = await SELF.fetch(`${base}/artifact-uploads`, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
      "Idempotency-Key": `helper-${(keyCounter += 1)}-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      entrypoint: "index.html",
      treeDigest: await computeArtifactTreeDigest(entries),
      files: entries,
      title: options.artifactId ? undefined : "Demo",
      artifactId: options.artifactId,
      baseVersion: options.baseVersion,
    }),
  });
  if (created.status !== 201) {
    throw new Error(`Failed to start upload: ${created.status}`);
  }
  const { sessionId } = (await created.json()) as { sessionId: string };
  for (const file of files) {
    const put = await SELF.fetch(
      `${base}/artifact-uploads/${sessionId}/files/${file.path}`,
      { method: "PUT", headers, body: file.content },
    );
    if (put.status !== 200) throw new Error(`Failed to upload ${file.path}`);
  }
  const done = await SELF.fetch(
    `${base}/artifact-uploads/${sessionId}/finalize`,
    { method: "POST", headers },
  );
  if (done.status !== 200)
    throw new Error(`Failed to finalize: ${done.status}`);
  return (await done.json()) as { artifactId: string; version: number };
}
