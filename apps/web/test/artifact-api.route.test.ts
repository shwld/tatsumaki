import { SELF, env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { computeArtifactTreeDigest } from "../src/domain/artifacts/manifest";
import { sha256Hex } from "../src/domain/artifacts/sha256";
import { createDb } from "../src/infrastructure/db/client";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import {
  artifactUploadSessionsTable,
  artifactVersionsTable,
} from "../src/infrastructure/db/schema/artifacts";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";
import { issueAccessToken } from "./helpers/cli-auth";

type TestFile = { path: string; content: string };
type Identity = { sub: string; email: string };

const OWNER: Identity = {
  sub: "github|test-user",
  email: "tester@example.com",
};
const MEMBER: Identity = { sub: "github|member", email: "member@example.com" };
const VIEWER: Identity = { sub: "github|viewer", email: "viewer@example.com" };
const OUTSIDER: Identity = {
  sub: "github|outsider",
  email: "outsider@example.com",
};

const SITE: TestFile[] = [
  { path: "index.html", content: "<script src=app.js></script>" },
  { path: "assets/app.js", content: "console.log(1)" },
];

let keyCounter = 0;
const nextKey = () => `key-${(keyCounter += 1)}`;

async function buildManifest(files: TestFile[], entrypoint = "index.html") {
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
  return {
    entrypoint,
    treeDigest: await computeArtifactTreeDigest(entries),
    files: entries,
  };
}

describe("artifact API", () => {
  const tokens: Record<string, string> = {};
  let projectId: string;
  let base: string;
  let keyBase: string;

  const call = async (
    method: string,
    path: string,
    options: {
      as?: Identity;
      body?: unknown;
      raw?: BodyInit;
      headers?: Record<string, string>;
      root?: string;
    } = {},
  ) => {
    const headers = new Headers(options.headers);
    const url = `${options.root ?? base}${path}`;
    const identity = options.as ?? OWNER;
    if (headers.has("X-Api-Key")) {
      // API key route: the key is the credential.
    } else if (url.includes("/programmatic-api/")) {
      tokens[identity.sub] ??= await issueAccessToken(identity);
      headers.set("authorization", `Bearer ${tokens[identity.sub]}`);
    } else {
      for (const [key, value] of Object.entries(
        await createAuthHeaders(identity),
      )) {
        headers.set(key, value);
      }
    }
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    return SELF.fetch(url, {
      method,
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : options.raw,
    });
  };

  const json = async <T = Record<string, unknown>>(response: Response) =>
    (await response.json()) as T;

  const addMember = async (identity: Identity, role: "member" | "viewer") => {
    await createAuthHeaders(identity);
    await new D1ProjectRepository(env.DB).upsertMember({
      projectId,
      userId: identity.sub,
      role,
    });
  };

  const startUpload = async (
    files: TestFile[],
    options: {
      as?: Identity;
      artifactId?: string;
      baseVersion?: number;
      title?: string;
      key?: string;
      entrypoint?: string;
    } = {},
  ) =>
    call("POST", "/artifact-uploads", {
      as: options.as,
      headers: { "Idempotency-Key": options.key ?? nextKey() },
      body: {
        ...(await buildManifest(files, options.entrypoint)),
        artifactId: options.artifactId,
        baseVersion: options.baseVersion,
        title: options.artifactId ? undefined : (options.title ?? "Demo"),
      },
    });

  const putFile = (
    sessionId: string,
    file: TestFile,
    options: { as?: Identity; content?: string } = {},
  ) =>
    call("PUT", `/artifact-uploads/${sessionId}/files/${file.path}`, {
      as: options.as,
      raw: options.content ?? file.content,
    });

  const finalize = (sessionId: string, as?: Identity) =>
    call("POST", `/artifact-uploads/${sessionId}/finalize`, { as });

  const publish = async (
    files: TestFile[],
    options: {
      artifactId?: string;
      baseVersion?: number;
      title?: string;
    } = {},
  ) => {
    const created = await startUpload(files, options);
    expect(created.status).toBe(201);
    const { sessionId } = await json<{ sessionId: string }>(created);
    for (const file of files) {
      expect((await putFile(sessionId, file)).status).toBe(200);
    }
    const done = await finalize(sessionId);
    expect(done.status).toBe(200);
    return json<{ artifactId: string; version: number; noop: boolean }>(done);
  };

  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
    const response = await call("POST", "", {
      root: "https://localhost/api/projects",
      body: { name: "Artifacts" },
    });
    projectId = (await json<{ project: { id: string } }>(response)).project.id;
    base = `https://localhost/programmatic-api/v1/projects/${projectId}`;
    keyBase = `https://localhost/api-key/v1/projects/${projectId}`;
  });

  describe("publish flow", () => {
    it("publishes a new artifact and serves its files and metadata", async () => {
      const published = await publish(SITE, { title: "  Demo  " });
      expect(published).toMatchObject({ version: 1, noop: false });

      const detail = await json<{
        artifact: { title: string; latestVersion: number };
        latestVersion: { files: Array<{ path: string; contentType: string }> };
      }>(await call("GET", `/artifacts/${published.artifactId}`));
      expect(detail.artifact).toMatchObject({
        title: "Demo",
        latestVersion: 1,
      });
      expect(
        detail.latestVersion.files.map((f) => [f.path, f.contentType]).sort(),
      ).toEqual([
        ["assets/app.js", "text/javascript; charset=utf-8"],
        ["index.html", "text/html; charset=utf-8"],
      ]);

      const download = await call(
        "GET",
        `/artifacts/${published.artifactId}/versions/1/files/assets/app.js`,
      );
      expect(download.status).toBe(200);
      expect(await download.text()).toBe("console.log(1)");
      expect(download.headers.get("content-type")).toBe(
        "text/javascript; charset=utf-8",
      );
      expect(download.headers.get("x-content-type-options")).toBe("nosniff");
      expect(download.headers.get("content-security-policy")).toBe("sandbox");
      expect(download.headers.get("cache-control")).toContain("no-store");
      expect(download.headers.get("content-disposition")).toContain(
        "attachment",
      );

      const list = await json<{ artifacts: Array<{ id: string }> }>(
        await call("GET", "/artifacts"),
      );
      expect(list.artifacts.map((a) => a.id)).toEqual([published.artifactId]);
    });

    it("keeps past versions immutable when publishing the next one", async () => {
      const first = await publish(SITE);
      const changed = [
        SITE[0] as TestFile,
        { path: "assets/app.js", content: "v2" },
      ];

      const second = await publish(changed, {
        artifactId: first.artifactId,
        baseVersion: 1,
      });

      expect(second.version).toBe(2);
      const versions = await json<{ versions: Array<{ version: number }> }>(
        await call("GET", `/artifacts/${first.artifactId}/versions`),
      );
      expect(versions.versions.map((v) => v.version)).toEqual([2, 1]);
      const oldFile = await call(
        "GET",
        `/artifacts/${first.artifactId}/versions/1/files/assets/app.js`,
      );
      expect(await oldFile.text()).toBe("console.log(1)");
      const newFile = await call(
        "GET",
        `/artifacts/${first.artifactId}/versions/2/files/assets/app.js`,
      );
      expect(await newFile.text()).toBe("v2");
    });

    it("answers a re-upload of the latest tree with a no-op and no new version", async () => {
      const first = await publish(SITE);

      const response = await startUpload(SITE, {
        artifactId: first.artifactId,
        baseVersion: 1,
      });

      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({
        noop: true,
        artifactId: first.artifactId,
        version: 1,
      });
      const versions = await createDb(env.DB)
        .select()
        .from(artifactVersionsTable)
        .all();
      expect(versions).toHaveLength(1);
    });

    it("publishes a rollback to an older tree as a new version", async () => {
      const first = await publish(SITE);
      const other = [
        SITE[0] as TestFile,
        { path: "assets/app.js", content: "v2" },
      ];
      await publish(other, { artifactId: first.artifactId, baseVersion: 1 });

      const rollback = await publish(SITE, {
        artifactId: first.artifactId,
        baseVersion: 2,
      });

      expect(rollback.version).toBe(3);
    });

    it("rejects a stale base version without touching latest", async () => {
      const first = await publish(SITE);
      await publish([SITE[0] as TestFile, { path: "a.js", content: "x" }], {
        artifactId: first.artifactId,
        baseVersion: 1,
      });

      const stale = await startUpload(SITE, {
        artifactId: first.artifactId,
        baseVersion: 1,
      });

      expect(stale.status).toBe(409);
      expect((await json<{ code: string }>(stale)).code).toBe(
        "BASE_VERSION_CONFLICT",
      );
      const artifact = await json<{ artifact: { latestVersion: number } }>(
        await call("GET", `/artifacts/${first.artifactId}`),
      );
      expect(artifact.artifact.latestVersion).toBe(2);
    });

    it("keeps a finalize retry from creating a second version", async () => {
      const created = await startUpload(SITE);
      const { sessionId } = await json<{ sessionId: string }>(created);
      for (const file of SITE) await putFile(sessionId, file);

      const first = await json(await finalize(sessionId));
      const again = await json(await finalize(sessionId));

      expect(again).toEqual(first);
      expect(
        await createDb(env.DB).select().from(artifactVersionsTable).all(),
      ).toHaveLength(1);
    });

    it("refuses to finalize while files are missing", async () => {
      const created = await startUpload(SITE);
      const { sessionId } = await json<{ sessionId: string }>(created);
      await putFile(sessionId, SITE[0] as TestFile);

      const response = await finalize(sessionId);

      expect(response.status).toBe(409);
      expect((await json<{ code: string }>(response)).code).toBe(
        "UPLOAD_INCOMPLETE",
      );
      expect(
        await createDb(env.DB).select().from(artifactVersionsTable).all(),
      ).toHaveLength(0);
    });

    it("lists already uploaded paths so an interrupted upload can resume", async () => {
      const key = nextKey();
      const first = await startUpload(SITE, { key });
      const { sessionId } = await json<{ sessionId: string }>(first);
      await putFile(sessionId, SITE[1] as TestFile);

      const replay = await startUpload(SITE, { key });

      expect(replay.status).toBe(201);
      expect(await json(replay)).toMatchObject({
        sessionId,
        uploadedPaths: ["assets/app.js"],
      });
    });
  });

  describe("idempotency", () => {
    it("rejects a reused Idempotency-Key with a different request", async () => {
      const key = nextKey();
      await startUpload(SITE, { key });

      const response = await startUpload(
        [SITE[0] as TestFile, { path: "other.js", content: "y" }],
        { key },
      );

      expect(response.status).toBe(422);
      expect((await json<{ code: string }>(response)).code).toBe(
        "IDEMPOTENCY_KEY_REUSED",
      );
    });

    it("returns the published session when the creation is replayed after finalize", async () => {
      const key = nextKey();
      const created = await startUpload(SITE, { key });
      const { sessionId } = await json<{ sessionId: string }>(created);
      for (const file of SITE) await putFile(sessionId, file);
      await finalize(sessionId);

      const replay = await startUpload(SITE, { key });

      expect(replay.status).toBe(201);
      expect(await json(replay)).toMatchObject({
        sessionId,
        status: "published",
      });
    });

    it("requires an Idempotency-Key", async () => {
      const response = await call("POST", "/artifact-uploads", {
        body: { ...(await buildManifest(SITE)), title: "Demo" },
      });
      expect(response.status).toBe(400);
    });
  });

  describe("file upload validation", () => {
    let sessionId: string;
    beforeEach(async () => {
      const created = await startUpload(SITE);
      sessionId = (await json<{ sessionId: string }>(created)).sessionId;
    });

    it.each([
      ["a different sha256", "console.log(2)", "FILE_DIGEST_MISMATCH"],
      ["a different size", "console.log(1)x", "FILE_SIZE_MISMATCH"],
      ["an empty body", "", "FILE_SIZE_MISMATCH"],
    ])("rejects %s and stores nothing", async (_name, content, code) => {
      const response = await putFile(sessionId, SITE[1] as TestFile, {
        content,
      });

      expect(response.status).toBe(422);
      expect((await json<{ code: string }>(response)).code).toBe(code);
      expect((await finalize(sessionId)).status).toBe(409);
    });

    it("rejects a path that is not in the manifest", async () => {
      const response = await call(
        "PUT",
        `/artifact-uploads/${sessionId}/files/extra.js`,
        { raw: "x" },
      );
      expect(response.status).toBe(422);
      expect((await json<{ code: string }>(response)).code).toBe(
        "FILE_NOT_IN_MANIFEST",
      );
    });

    it("resolves percent-encoded paths exactly once", async () => {
      const files: TestFile[] = [
        SITE[0] as TestFile,
        { path: "100%25.txt", content: "literal" },
      ];
      const created = await startUpload(files);
      const { sessionId: id } = await json<{ sessionId: string }>(created);

      const response = await call(
        "PUT",
        `/artifact-uploads/${id}/files/100%2525.txt`,
        { raw: "literal" },
      );

      expect(response.status).toBe(200);
    });

    it("refuses uploads and finalize after the session expired", async () => {
      await putFile(sessionId, SITE[0] as TestFile);
      await putFile(sessionId, SITE[1] as TestFile);
      await createDb(env.DB)
        .update(artifactUploadSessionsTable)
        .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
        .where(eq(artifactUploadSessionsTable.id, sessionId));

      const upload = await putFile(sessionId, SITE[0] as TestFile);
      const done = await finalize(sessionId);

      expect(upload.status).toBe(410);
      expect(done.status).toBe(410);
      expect(
        await createDb(env.DB).select().from(artifactVersionsTable).all(),
      ).toHaveLength(0);
    });
  });

  describe("manifest validation", () => {
    it.each([
      [
        "unsupported file type",
        [SITE[0], { path: "a.exe", content: "x" }],
        415,
      ],
      ["pdf", [SITE[0], { path: "a.pdf", content: "x" }], 415],
      ["sensitive file", [SITE[0], { path: ".env", content: "x" }], 400],
      ["path traversal", [SITE[0], { path: "../x.js", content: "x" }], 400],
      [
        "case-only duplicate",
        [SITE[0], { path: "Index.html", content: "x" }],
        400,
      ],
    ] as Array<
      [string, TestFile[], number]
    >)("rejects %s", async (_name, files, status) => {
      const response = await startUpload(files);
      expect(response.status).toBe(status);
    });

    it("rejects an entrypoint that is not an html file in the manifest", async () => {
      const response = await startUpload(SITE, { entrypoint: "assets/app.js" });
      expect(response.status).toBe(400);
    });

    it("rejects a tree digest that does not match", async () => {
      const response = await call("POST", "/artifact-uploads", {
        headers: { "Idempotency-Key": nextKey() },
        body: {
          ...(await buildManifest(SITE)),
          treeDigest: "0".repeat(64),
          title: "Demo",
        },
      });
      expect(response.status).toBe(422);
    });

    it("returns 413 for a file over the limit", async () => {
      const big = {
        ...(await buildManifest([SITE[0] as TestFile])),
      };
      big.files = [
        { ...(big.files[0] as object), size: 26 * 1024 * 1024 } as never,
      ];
      big.treeDigest = await computeArtifactTreeDigest(big.files);
      const response = await call("POST", "/artifact-uploads", {
        headers: { "Idempotency-Key": nextKey() },
        body: { ...big, title: "Big" },
      });
      expect(response.status).toBe(413);
    });
  });

  describe("authorization", () => {
    beforeEach(async () => {
      await addMember(MEMBER, "member");
      await addMember(VIEWER, "viewer");
      await createAuthHeaders(OUTSIDER);
    });

    it("answers 404 to non-members on every endpoint, whatever the input", async () => {
      const published = await publish(SITE);
      const requests: Array<[string, string, unknown?]> = [
        ["GET", "/artifacts"],
        ["GET", `/artifacts/${published.artifactId}`],
        ["GET", `/artifacts/${published.artifactId}/versions`],
        [
          "GET",
          `/artifacts/${published.artifactId}/versions/1/files/index.html`,
        ],
        ["PATCH", `/artifacts/${published.artifactId}`, { title: "x" }],
        ["POST", `/artifacts/${published.artifactId}/archive`],
        ["POST", "/artifact-uploads/some-session/finalize"],
        ["PUT", "/artifact-uploads/some-session/files/index.html"],
      ];
      for (const [method, path, body] of requests) {
        const response = await call(method, path, { as: OUTSIDER, body });
        expect(response.status, `${method} ${path}`).toBe(404);
      }
      const invalid = await call("POST", "/artifact-uploads", {
        as: OUTSIDER,
        body: { nonsense: true },
      });
      expect(invalid.status).toBe(404);
    });

    it("lets a viewer read but not write", async () => {
      const published = await publish(SITE);

      for (const path of [
        "/artifacts",
        `/artifacts/${published.artifactId}`,
        `/artifacts/${published.artifactId}/versions/1`,
        `/artifacts/${published.artifactId}/versions/1/files/index.html`,
      ]) {
        expect((await call("GET", path, { as: VIEWER })).status).toBe(200);
      }
      expect(
        (
          await call("PATCH", `/artifacts/${published.artifactId}`, {
            as: VIEWER,
            body: { title: "x" },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await call("POST", `/artifacts/${published.artifactId}/archive`, {
            as: VIEWER,
          })
        ).status,
      ).toBe(403);
      const upload = await startUpload(SITE, {
        as: VIEWER,
        artifactId: published.artifactId,
        baseVersion: 1,
      });
      expect(upload.status).toBe(403);
    });

    it("reports invalid input before the viewer's missing permission", async () => {
      const response = await startUpload([{ path: "a.exe", content: "x" }], {
        as: VIEWER,
        entrypoint: "a.exe",
      });
      expect(response.status).toBe(415);
    });

    it("lets a member publish", async () => {
      const published = await publish(SITE);
      const created = await startUpload(
        [SITE[0] as TestFile, { path: "m.js", content: "m" }],
        { as: MEMBER, artifactId: published.artifactId, baseVersion: 1 },
      );
      expect(created.status).toBe(201);
    });

    it("hides sessions from other users and other projects", async () => {
      const created = await startUpload(SITE);
      const { sessionId } = await json<{ sessionId: string }>(created);

      expect(
        (await putFile(sessionId, SITE[0] as TestFile, { as: MEMBER })).status,
      ).toBe(404);
      expect((await finalize(sessionId, MEMBER)).status).toBe(404);

      const other = await call("POST", "", {
        root: "https://localhost/api/projects",
        body: { name: "Other" },
      });
      const otherId = (await json<{ project: { id: string } }>(other)).project
        .id;
      const crossProject = await call(
        "POST",
        `/artifact-uploads/${sessionId}/finalize`,
        {
          root: `https://localhost/programmatic-api/v1/projects/${otherId}`,
        },
      );
      expect(crossProject.status).toBe(404);
    });

    it("does not let an update target another project's artifact", async () => {
      const published = await publish(SITE);
      const other = await call("POST", "", {
        root: "https://localhost/api/projects",
        body: { name: "Other" },
      });
      const otherId = (await json<{ project: { id: string } }>(other)).project
        .id;

      const response = await call("POST", "/artifact-uploads", {
        root: `https://localhost/programmatic-api/v1/projects/${otherId}`,
        headers: { "Idempotency-Key": nextKey() },
        body: {
          ...(await buildManifest(SITE)),
          artifactId: published.artifactId,
          baseVersion: 1,
        },
      });

      expect(response.status).toBe(404);
    });
  });

  describe("metadata and archive", () => {
    it("changes title and archive state without adding versions", async () => {
      const published = await publish(SITE);
      const id = published.artifactId;

      const renamed = await call("PATCH", `/artifacts/${id}`, {
        body: { title: "Renamed" },
      });
      expect(renamed.status).toBe(200);
      await call("POST", `/artifacts/${id}/archive`);

      const active = await json<{ artifacts: unknown[] }>(
        await call("GET", "/artifacts"),
      );
      const archived = await json<{ artifacts: Array<{ title: string }> }>(
        await call("GET", "/artifacts?archived=true"),
      );
      expect(active.artifacts).toHaveLength(0);
      expect(archived.artifacts.map((a) => a.title)).toEqual(["Renamed"]);
      expect((await call("GET", `/artifacts/${id}`)).status).toBe(200);

      await call("POST", `/artifacts/${id}/unarchive`);
      expect(
        (await json<{ artifacts: unknown[] }>(await call("GET", "/artifacts")))
          .artifacts,
      ).toHaveLength(1);
      expect(
        await createDb(env.DB).select().from(artifactVersionsTable).all(),
      ).toHaveLength(1);
    });

    it("still allows publishing to an archived artifact", async () => {
      const published = await publish(SITE);
      await call("POST", `/artifacts/${published.artifactId}/archive`);

      const next = await publish(
        [SITE[0] as TestFile, { path: "n.js", content: "n" }],
        { artifactId: published.artifactId, baseVersion: 1 },
      );

      expect(next.version).toBe(2);
    });

    it("rejects an invalid title", async () => {
      const published = await publish(SITE);
      const response = await call(
        "PATCH",
        `/artifacts/${published.artifactId}`,
        {
          body: { title: "   " },
        },
      );
      expect(response.status).toBe(400);
    });
  });

  describe("API key access", () => {
    const issueKey = async (scopes: string[], forProject = projectId) => {
      const response = await call("POST", `/${forProject}/api-keys`, {
        root: "https://localhost/api/projects",
        body: { name: "k", scopes },
      });
      expect(response.status).toBe(201);
      return (await json<{ rawKey: string }>(response)).rawKey;
    };

    it("lists artifact scopes in the invalid scope message", async () => {
      const response = await call("POST", `/${projectId}/api-keys`, {
        root: "https://localhost/api/projects",
        body: { name: "k", scopes: ["bogus"] },
      });
      expect(response.status).toBe(400);
      const { error } = await json<{ error: string }>(response);
      expect(error).toContain("artifact:read");
      expect(error).toContain("artifact:write");
    });

    it("runs the whole publish flow with artifact:read and artifact:write", async () => {
      const rawKey = await issueKey(["artifact:read", "artifact:write"]);
      const headers = { "X-Api-Key": rawKey };
      const manifest = await buildManifest(SITE);

      const created = await call("POST", "/artifact-uploads", {
        root: keyBase,
        headers: { ...headers, "Idempotency-Key": nextKey() },
        body: { ...manifest, title: "Keyed" },
      });
      expect(created.status).toBe(201);
      const { sessionId } = await json<{ sessionId: string }>(created);
      for (const file of SITE) {
        const put = await call(
          "PUT",
          `/artifact-uploads/${sessionId}/files/${file.path}`,
          { root: keyBase, headers, raw: file.content },
        );
        expect(put.status).toBe(200);
      }
      const done = await call(
        "POST",
        `/artifact-uploads/${sessionId}/finalize`,
        {
          root: keyBase,
          headers,
        },
      );
      expect(done.status).toBe(200);
      const listed = await call("GET", "/artifacts", {
        root: keyBase,
        headers,
      });
      expect(listed.status).toBe(200);
    });

    it("matches scopes exactly: read cannot write and write cannot read", async () => {
      const readKey = await issueKey(["artifact:read"]);
      const writeKey = await issueKey(["artifact:write"]);

      const write = await call("POST", "/artifact-uploads", {
        root: keyBase,
        headers: { "X-Api-Key": readKey, "Idempotency-Key": nextKey() },
        body: { ...(await buildManifest(SITE)), title: "x" },
      });
      const read = await call("GET", "/artifacts", {
        root: keyBase,
        headers: { "X-Api-Key": writeKey },
      });

      expect(write.status).toBe(403);
      expect(read.status).toBe(403);
    });

    it("answers 404 for a key issued to another project", async () => {
      const other = await call("POST", "", {
        root: "https://localhost/api/projects",
        body: { name: "Other" },
      });
      const otherId = (await json<{ project: { id: string } }>(other)).project
        .id;
      const rawKey = await issueKey(["artifact:read"], otherId);

      const response = await call("GET", "/artifacts", {
        root: keyBase,
        headers: { "X-Api-Key": rawKey },
      });

      expect(response.status).toBe(404);
    });

    it("denies writes once the key owner was demoted to viewer", async () => {
      const rawKey = await issueKey(["artifact:read", "artifact:write"]);
      await new D1ProjectRepository(env.DB).upsertMember({
        projectId,
        userId: OWNER.sub,
        role: "viewer",
      });

      const response = await call("POST", "/artifact-uploads", {
        root: keyBase,
        headers: { "X-Api-Key": rawKey, "Idempotency-Key": nextKey() },
        body: { ...(await buildManifest(SITE)), title: "x" },
      });

      expect(response.status).toBe(403);
    });

    it("does not give existing story keys access to artifacts", async () => {
      const rawKey = await issueKey(["story:write", "story:read"]);
      const response = await call("GET", "/artifacts", {
        root: keyBase,
        headers: { "X-Api-Key": rawKey },
      });
      expect(response.status).toBe(403);
    });
  });
});
