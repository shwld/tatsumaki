import { readFileSync, readdirSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { computeArtifactTreeDigest } from "../../../src/domain/artifacts/manifest";
import { sha256Hex } from "../../../src/domain/artifacts/sha256";

export const BASE_URL =
  process.env.ARTIFACT_SANDBOX_URL ?? "http://127.0.0.1:8788";

export type SiteFile = { path: string; body: Buffer };

/** Reads a fixture directory into upload files with `/`-separated paths. */
export function readFixtureDirectory(directory: string): SiteFile[] {
  const files: SiteFile[] = [];
  const walk = (current: string, prefix: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, relative);
      else files.push({ path: relative, body: readFileSync(full) });
    }
  };
  walk(directory, "");
  return files;
}

async function call(pathname: string, init: RequestInit = {}) {
  return fetch(`${BASE_URL}${pathname}`, init);
}

export async function createProject(name: string): Promise<string> {
  const response = await call("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(`project creation failed: ${response.status}`);
  }
  return ((await response.json()) as { project: { id: string } }).project.id;
}

let keyCounter = 0;

/**
 * Publishes a directory through the real programmatic API (the dev server
 * authenticates every request as the dev user).
 */
export async function publishSite(
  projectId: string,
  files: SiteFile[],
  options: {
    title?: string;
    artifactId?: string;
    baseVersion?: number;
    entrypoint?: string;
  } = {},
): Promise<{ artifactId: string; version: number }> {
  const entries = files.map((file) => ({
    path: file.path,
    size: file.body.byteLength,
    sha256: "",
  }));
  for (const [index, file] of files.entries()) {
    (entries[index] as { sha256: string }).sha256 = await sha256Hex(
      new Uint8Array(file.body),
    );
  }
  const base = `/programmatic-api/v1/projects/${projectId}`;
  keyCounter += 1;
  const created = await call(`${base}/artifact-uploads`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `sandbox-${Date.now()}-${keyCounter}`,
    },
    body: JSON.stringify({
      entrypoint: options.entrypoint ?? "index.html",
      treeDigest: await computeArtifactTreeDigest(entries),
      files: entries,
      ...(options.artifactId
        ? { artifactId: options.artifactId, baseVersion: options.baseVersion }
        : { title: options.title ?? "sandbox probe" }),
    }),
  });
  if (!created.ok) {
    throw new Error(
      `upload session failed: ${created.status} ${await created.text()}`,
    );
  }
  const { sessionId } = (await created.json()) as { sessionId: string };

  for (const file of files) {
    const encoded = file.path.split("/").map(encodeURIComponent).join("/");
    const put = await call(
      `${base}/artifact-uploads/${sessionId}/files/${encoded}`,
      {
        method: "PUT",
        body: new Uint8Array(file.body),
      },
    );
    if (!put.ok)
      throw new Error(`upload of ${file.path} failed: ${put.status}`);
  }

  const done = await call(`${base}/artifact-uploads/${sessionId}/finalize`, {
    method: "POST",
  });
  if (!done.ok)
    throw new Error(`finalize failed: ${done.status} ${await done.text()}`);
  return (await done.json()) as { artifactId: string; version: number };
}

export type PreviewToken = {
  token: string;
  expiresAt: string;
  contentPath: string;
};

export async function issuePreviewToken(
  projectId: string,
  artifactId: string,
  version: number,
): Promise<PreviewToken> {
  const response = await call(
    `/api/projects/${projectId}/artifacts/${artifactId}/versions/${version}/preview-token`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(
      `preview token failed: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as PreviewToken;
}

/** URL of a file inside the content route for an issued token. */
export function contentUrl(token: string, filePath: string): string {
  const encoded = filePath.split("/").map(encodeURIComponent).join("/");
  return `${BASE_URL}/artifact-content/${token}/${encoded}`;
}

/**
 * GET with the path sent exactly as given. fetch() and the browser normalize
 * `..` and `%2e` away before sending, which would hide path-traversal cases.
 */
export function rawGet(
  rawPath: string,
  headers: Record<string, string> = {},
): Promise<{
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> {
  const url = new URL(BASE_URL);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: rawPath,
        method: "GET",
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
          }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}
