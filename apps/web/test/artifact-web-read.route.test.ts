import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { issueAccessToken } from "./helpers/cli-auth";
import { resetDatabase } from "./helpers/db";
import { publishTestArtifact } from "./helpers/publish-artifact";

type Identity = { sub: string; email: string };

const OWNER: Identity = {
  sub: "github|test-user",
  email: "tester@example.com",
};
const VIEWER: Identity = { sub: "github|viewer", email: "viewer@example.com" };
const OUTSIDER: Identity = {
  sub: "github|outsider",
  email: "outsider@example.com",
};

const SITE = [
  { path: "index.html", content: "<p>one</p>" },
  { path: "assets/app.js", content: "console.log(1)" },
];

describe("artifact read API for the web app (/api)", () => {
  let projectId: string;
  let artifactId: string;

  const web = async (
    method: string,
    path: string,
    options: { as?: Identity; anonymous?: boolean; body?: BodyInit } = {},
  ) => {
    const headers = new Headers();
    if (!options.anonymous) {
      for (const [key, value] of Object.entries(
        await createAuthHeaders(options.as ?? OWNER),
      )) {
        headers.set(key, value);
      }
    }
    return SELF.fetch(`https://localhost/api/projects${path}`, {
      method,
      headers,
      body: options.body,
    });
  };

  const json = async <T = Record<string, unknown>>(response: Response) =>
    (await response.json()) as T;

  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
    const created = await web("POST", "", {
      body: JSON.stringify({ name: "Artifacts" }),
    });
    projectId = (await json<{ project: { id: string } }>(created)).project.id;
    for (const identity of [VIEWER, OUTSIDER])
      await createAuthHeaders(identity);
    await new D1ProjectRepository(env.DB).upsertMember({
      projectId,
      userId: VIEWER.sub,
      role: "viewer",
    });
    ({ artifactId } = await publishTestArtifact(projectId, SITE, OWNER));
  });

  describe("reading", () => {
    it("lists artifacts and shows the latest version with its files", async () => {
      const list = await json<{
        artifacts: Array<{ id: string; title: string }>;
      }>(await web("GET", `/${projectId}/artifacts`));
      expect(list.artifacts.map((a) => [a.id, a.title])).toEqual([
        [artifactId, "Demo"],
      ]);

      const detail = await json<{
        artifact: { id: string; latestVersion: number; createdBy: string };
        latestVersion: {
          version: number;
          entrypoint: string;
          fileCount: number;
          totalBytes: number;
          createdAt: string;
          files: Array<{ path: string; size: number; contentType: string }>;
        };
      }>(await web("GET", `/${projectId}/artifacts/${artifactId}`));
      expect(detail.artifact).toMatchObject({
        id: artifactId,
        latestVersion: 1,
      });
      expect(detail.latestVersion).toMatchObject({
        version: 1,
        entrypoint: "index.html",
        fileCount: 2,
        totalBytes: 24,
      });
      expect(detail.latestVersion.files.map((f) => f.path).sort()).toEqual([
        "assets/app.js",
        "index.html",
      ]);
    });

    it("lists versions newest first and shows one version's manifest", async () => {
      await publishTestArtifact(
        projectId,
        [
          SITE[0] as (typeof SITE)[number],
          { path: "assets/app.js", content: "v2" },
        ],
        OWNER,
        { artifactId, baseVersion: 1 },
      );

      const versions = await json<{ versions: Array<{ version: number }> }>(
        await web("GET", `/${projectId}/artifacts/${artifactId}/versions`),
      );
      expect(versions.versions.map((v) => v.version)).toEqual([2, 1]);

      const first = await json<{
        version: { version: number };
        files: Array<{ path: string; size: number }>;
      }>(await web("GET", `/${projectId}/artifacts/${artifactId}/versions/1`));
      expect(first.version.version).toBe(1);
      expect(first.files.find((f) => f.path === "assets/app.js")?.size).toBe(
        14,
      );
    });

    it("keeps archived artifacts out of the default list but readable by id", async () => {
      const token = await issueAccessToken(OWNER);
      const archived = await SELF.fetch(
        `https://localhost/programmatic-api/v1/projects/${projectId}/artifacts/${artifactId}/archive`,
        { method: "POST", headers: { authorization: `Bearer ${token}` } },
      );
      expect(archived.status).toBe(200);

      const active = await json<{ artifacts: unknown[] }>(
        await web("GET", `/${projectId}/artifacts`),
      );
      expect(active.artifacts).toEqual([]);

      const detail = await web("GET", `/${projectId}/artifacts/${artifactId}`, {
        as: VIEWER,
      });
      expect(detail.status).toBe(200);
      expect(
        (await json<{ artifact: { archivedAt: string | null } }>(detail))
          .artifact.archivedAt,
      ).not.toBeNull();
    });

    it("answers 404 for an unknown artifact, an unknown version or a malformed one", async () => {
      expect(
        (await web("GET", `/${projectId}/artifacts/01JNMVQ8Q9Y6P5KH1XZ4V7C2TZ`))
          .status,
      ).toBe(404);
      for (const version of ["2", "0", "-1", "abc"]) {
        expect(
          (
            await web(
              "GET",
              `/${projectId}/artifacts/${artifactId}/versions/${version}`,
            )
          ).status,
          version,
        ).toBe(404);
      }
    });

    it("does not serve an artifact through another project", async () => {
      const other = await json<{ project: { id: string } }>(
        await web("POST", "", { body: JSON.stringify({ name: "Other" }) }),
      );
      const response = await web(
        "GET",
        `/${other.project.id}/artifacts/${artifactId}`,
      );
      expect(response.status).toBe(404);
    });
  });

  describe("who may read", () => {
    it("lets a viewer read everything and obtain a preview token", async () => {
      for (const path of [
        `/${projectId}/artifacts`,
        `/${projectId}/artifacts/${artifactId}`,
        `/${projectId}/artifacts/${artifactId}/versions`,
        `/${projectId}/artifacts/${artifactId}/versions/1`,
      ]) {
        expect((await web("GET", path, { as: VIEWER })).status, path).toBe(200);
      }
      const preview = await web(
        "POST",
        `/${projectId}/artifacts/${artifactId}/versions/1/preview-token`,
        { as: VIEWER },
      );
      expect(preview.status).toBe(200);
    });

    it("answers 404 to a non-member everywhere, preview token included", async () => {
      for (const [method, path] of [
        ["GET", `/${projectId}/artifacts`],
        ["GET", `/${projectId}/artifacts/${artifactId}`],
        ["GET", `/${projectId}/artifacts/${artifactId}/versions`],
        ["GET", `/${projectId}/artifacts/${artifactId}/versions/1`],
        [
          "POST",
          `/${projectId}/artifacts/${artifactId}/versions/1/preview-token`,
        ],
      ] as const) {
        expect(
          (await web(method, path, { as: OUTSIDER })).status,
          `${method} ${path}`,
        ).toBe(404);
      }
    });

    it("refuses an anonymous request", async () => {
      for (const path of [
        `/${projectId}/artifacts`,
        `/${projectId}/artifacts/${artifactId}`,
        `/${projectId}/artifacts/${artifactId}/versions/1`,
      ]) {
        expect((await web("GET", path, { anonymous: true })).status, path).toBe(
          401,
        );
      }
    });
  });

  describe("what the web app can not do", () => {
    it("exposes no way to create, change, archive or download from /api", async () => {
      const base = `/${projectId}/artifacts/${artifactId}`;
      const attempts: Array<[string, string, BodyInit | undefined]> = [
        ["POST", `/${projectId}/artifact-uploads`, "{}"],
        [
          "PUT",
          `/${projectId}/artifact-uploads/some-session/files/index.html`,
          "x",
        ],
        [
          "POST",
          `/${projectId}/artifact-uploads/some-session/finalize`,
          undefined,
        ],
        ["PATCH", base, JSON.stringify({ title: "hijacked" })],
        ["POST", `${base}/archive`, undefined],
        ["POST", `${base}/unarchive`, undefined],
        ["DELETE", base, undefined],
      ];
      for (const [method, path, body] of attempts) {
        const response = await web(method, path, { body });
        expect(response.status, `${method} ${path}`).toBe(404);
      }

      // An unmatched GET falls through to the SPA shell (the test environment has
      // no assets binding, so it errors), but it never serves the file.
      const download = await web("GET", `${base}/versions/1/files/index.html`);
      expect(await download.text()).not.toContain("<p>one</p>");
      expect(download.headers.get("content-disposition")).toBeNull();

      // And nothing changed.
      const detail = await json<{
        artifact: {
          title: string;
          archivedAt: string | null;
          latestVersion: number;
        };
      }>(await web("GET", base));
      expect(detail.artifact).toMatchObject({
        title: "Demo",
        archivedAt: null,
        latestVersion: 1,
      });
    });
  });
});
