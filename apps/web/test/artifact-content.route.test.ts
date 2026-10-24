import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { signArtifactContentToken } from "../src/application/services/artifact-content-token";
import { spaIndexHeaders } from "../src/presentation/spa-headers";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { issueAccessToken } from "./helpers/cli-auth";
import { resetDatabase } from "./helpers/db";
import {
  publishTestArtifact,
  type TestFile,
  type TestIdentity,
} from "./helpers/publish-artifact";

const OWNER: TestIdentity = {
  sub: "github|test-user",
  email: "tester@example.com",
};
const VIEWER: TestIdentity = {
  sub: "github|viewer",
  email: "viewer@example.com",
};
const OUTSIDER: TestIdentity = {
  sub: "github|outsider",
  email: "outsider@example.com",
};

const SITE: TestFile[] = [
  {
    path: "index.html",
    content: "<script src=assets/app.js></script><link href=style.css>",
  },
  { path: "assets/app.js", content: "console.log(1)" },
  { path: "style.css", content: "body{}" },
];

const IFRAME: Record<string, string> = {
  "Sec-Fetch-Dest": "iframe",
  "Sec-Fetch-Site": "same-origin",
};
const SUBRESOURCE: Record<string, string> = {
  "Sec-Fetch-Dest": "script",
  "Sec-Fetch-Site": "cross-site",
};

type PreviewToken = { token: string; expiresAt: string; contentPath: string };

describe("artifact content serving", () => {
  let projectId: string;
  let artifactId: string;

  const requestToken = async (
    identity: TestIdentity,
    target: { projectId?: string; artifactId?: string; version?: string } = {},
  ) =>
    SELF.fetch(
      `https://localhost/api/projects/${target.projectId ?? projectId}/artifacts/${target.artifactId ?? artifactId}/versions/${target.version ?? "1"}/preview-token`,
      { method: "POST", headers: await createAuthHeaders(identity) },
    );

  const issue = async (
    target: { projectId?: string; artifactId?: string; version?: string } = {},
  ) => (await (await requestToken(OWNER, target)).json()) as PreviewToken;

  const fetchContent = (
    token: string,
    path: string,
    headers: Record<string, string> = IFRAME,
  ) =>
    SELF.fetch(`https://localhost/artifact-content/${token}/${path}`, {
      headers,
    });

  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
    const created = await SELF.fetch("https://localhost/api/projects", {
      method: "POST",
      headers: {
        ...(await createAuthHeaders(OWNER)),
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Artifacts" }),
    });
    projectId = ((await created.json()) as { project: { id: string } }).project
      .id;
    const members = new D1ProjectRepository(env.DB);
    await createAuthHeaders(VIEWER);
    await createAuthHeaders(OUTSIDER);
    await members.upsertMember({
      projectId,
      userId: VIEWER.sub,
      role: "viewer",
    });
    ({ artifactId } = await publishTestArtifact(projectId, SITE, OWNER));
  });

  describe("preview-token endpoint", () => {
    it("issues a token with a content path for the entrypoint", async () => {
      const response = await requestToken(OWNER);
      expect(response.status).toBe(200);
      const body = (await response.json()) as PreviewToken;
      expect(body.contentPath).toBe(
        `/artifact-content/${body.token}/index.html`,
      );
      expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it("lets a viewer preview", async () => {
      expect((await requestToken(VIEWER)).status).toBe(200);
    });

    it("answers 404 to non-members and for unknown artifacts or versions", async () => {
      expect((await requestToken(OUTSIDER)).status).toBe(404);
      expect(
        (
          await requestToken(OWNER, {
            artifactId: "01HZZZZZZZZZZZZZZZZZZZZZZZ",
          })
        ).status,
      ).toBe(404);
      expect((await requestToken(OWNER, { version: "2" })).status).toBe(404);
      expect((await requestToken(OWNER, { version: "0" })).status).toBe(404);
      expect((await requestToken(OWNER, { version: "abc" })).status).toBe(404);
    });

    it("requires a session: API keys and anonymous callers cannot mint tokens", async () => {
      const url = `https://localhost/api/projects/${projectId}/artifacts/${artifactId}/versions/1/preview-token`;
      expect(
        (await SELF.fetch(url, { method: "POST", redirect: "manual" })).status,
      ).not.toBe(200);
      expect(
        (
          await SELF.fetch(url, {
            method: "POST",
            redirect: "manual",
            headers: { "X-Api-Key": "tk_anything" },
          })
        ).status,
      ).not.toBe(200);
    });

    it("answers 503 when no signing key is configured", async () => {
      const key = env.ARTIFACT_CONTENT_SIGNING_KEY;
      env.ARTIFACT_CONTENT_SIGNING_KEY = undefined;
      try {
        expect((await requestToken(OWNER)).status).toBe(503);
      } finally {
        env.ARTIFACT_CONTENT_SIGNING_KEY = key;
      }
    });
  });

  describe("content route", () => {
    it("serves the entrypoint when the path is empty and nested assets by path", async () => {
      const { token } = await issue();

      const root = await fetchContent(token, "");
      expect(root.status).toBe(200);
      expect(await root.text()).toBe(SITE[0]?.content);
      expect(root.headers.get("Content-Type")).toBe("text/html; charset=utf-8");

      const script = await fetchContent(token, "assets/app.js", SUBRESOURCE);
      expect(script.status).toBe(200);
      expect(await script.text()).toBe("console.log(1)");
      expect(script.headers.get("Content-Type")).toBe(
        "text/javascript; charset=utf-8",
      );
    });

    it("enforces the sandbox and hardening headers on every response", async () => {
      const { token } = await issue();
      const responses = [
        await fetchContent(token, "index.html"),
        await fetchContent(token, "missing.html"),
        await fetchContent("garbage", "index.html"),
      ];
      expect(responses.map((r) => r.status)).toEqual([200, 404, 404]);

      for (const response of responses) {
        const csp = response.headers.get("Content-Security-Policy") ?? "";
        expect(csp).toMatch(/^sandbox allow-scripts;/);
        expect(csp).not.toContain("allow-same-origin");
        expect(csp).toContain("default-src 'none'");
        expect(csp).toContain("connect-src 'none'");
        expect(csp).toContain("form-action 'none'");
        expect(csp).toContain("frame-ancestors https://localhost");
        expect(csp).not.toMatch(/'self'/);
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        expect(response.headers.get("Permissions-Policy")).toContain(
          "camera=()",
        );
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
        expect(response.headers.get("Cross-Origin-Resource-Policy")).toBeNull();
        expect(response.headers.get("Set-Cookie")).toBeNull();
      }
    });

    it("pins the CSP sources to the token path", async () => {
      const { token } = await issue();
      const csp =
        (await fetchContent(token, "index.html")).headers.get(
          "Content-Security-Policy",
        ) ?? "";
      const base = `https://localhost/artifact-content/${token}/`;
      expect(csp).toContain(`script-src ${base} 'unsafe-inline'`);
      expect(csp).toContain(`img-src ${base} data:`);
    });

    it("answers identically to every kind of invalid request", async () => {
      const { token } = await issue();
      const [mac] = token.split(".").slice(-1);
      const forged = token.replace(
        mac as string,
        "A".repeat((mac as string).length),
      );
      const expired = (
        await signArtifactContentToken(
          { current: env.ARTIFACT_CONTENT_SIGNING_KEY as string },
          { projectId, artifactId, version: 1 },
          new Date(Date.now() - 60 * 60 * 1000),
        )
      ).token;
      const bodies = await Promise.all(
        [
          fetchContent(forged, "index.html"),
          fetchContent(expired, "index.html"),
          fetchContent(token, "nope.html"),
          fetchContent(token, "../index.html"),
        ].map(async (pending) => {
          const response = await pending;
          return [response.status, await response.text()];
        }),
      );
      expect(new Set(bodies.map((b) => JSON.stringify(b)))).toEqual(
        new Set([JSON.stringify([404, "Not found"])]),
      );
    });

    it("rejects path traversal and non-canonical paths", async () => {
      const { token } = await issue();
      for (const path of [
        "%2e%2e/index.html",
        "assets%2F..%2Findex.html",
        "assets%5Capp.js",
        "%00index.html",
        "assets//app.js",
        "%ZZ",
        "%252e%252e/index.html",
        "assets%252Fapp.js",
        "assets/app.js/",
        "Assets/app.js",
      ]) {
        const response = await fetchContent(token, path);
        expect(response.status, path).toBe(404);
      }
    });

    it("does not serve another version, artifact or project through a token", async () => {
      const second = await publishTestArtifact(
        projectId,
        [
          { path: "index.html", content: "v2" },
          { path: "only-in-v2.txt", content: "v2 only" },
        ],
        OWNER,
        { artifactId, baseVersion: 1 },
      );
      expect(second.version).toBe(2);

      const v1 = await issue({ version: "1" });
      expect((await fetchContent(v1.token, "only-in-v2.txt")).status).toBe(404);
      expect(await (await fetchContent(v1.token, "index.html")).text()).toBe(
        SITE[0]?.content,
      );

      const v2 = await issue({ version: "2" });
      expect(await (await fetchContent(v2.token, "index.html")).text()).toBe(
        "v2",
      );

      // A token claiming a project the artifact does not belong to resolves nothing.
      const { current } = {
        current: env.ARTIFACT_CONTENT_SIGNING_KEY as string,
      };
      const crossProject = await signArtifactContentToken(
        { current },
        { projectId: "01HZZZZZZZZZZZZZZZZZZZZZZZ", artifactId, version: 1 },
        new Date(),
      );
      expect(
        (await fetchContent(crossProject.token, "index.html")).status,
      ).toBe(404);
      const unknownVersion = await signArtifactContentToken(
        { current },
        { projectId, artifactId, version: 99 },
        new Date(),
      );
      expect(
        (await fetchContent(unknownVersion.token, "index.html")).status,
      ).toBe(404);
    });

    it("ignores cookies and credentials", async () => {
      const { token } = await issue();
      const response = await SELF.fetch(
        `https://localhost/artifact-content/${token}/index.html`,
        {
          headers: {
            ...IFRAME,
            Cookie: "CF_Authorization=anything",
            Authorization: "Bearer anything",
          },
        },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Set-Cookie")).toBeNull();
    });

    it("rejects embedding it as a script of the app and requests without fetch metadata", async () => {
      const { token } = await issue();
      const cases: Record<string, string>[] = [
        { "Sec-Fetch-Dest": "script", "Sec-Fetch-Site": "same-origin" },
        { "Sec-Fetch-Dest": "script", "Sec-Fetch-Site": "same-site" },
        { "Sec-Fetch-Dest": "style", "Sec-Fetch-Site": "same-origin" },
        { "Sec-Fetch-Dest": "script" },
        {},
      ];
      for (const headers of cases) {
        expect(
          (await fetchContent(token, "assets/app.js", headers)).status,
          JSON.stringify(headers),
        ).toBe(404);
      }
      expect(
        (
          await fetchContent(token, "index.html", {
            "Sec-Fetch-Dest": "document",
          })
        ).status,
      ).toBe(200);
    });

    it("answers 404 when no signing key is configured", async () => {
      const { token } = await issue();
      const key = env.ARTIFACT_CONTENT_SIGNING_KEY;
      env.ARTIFACT_CONTENT_SIGNING_KEY = undefined;
      try {
        expect((await fetchContent(token, "index.html")).status).toBe(404);
      } finally {
        env.ARTIFACT_CONTENT_SIGNING_KEY = key;
      }
    });

    it("keeps serving an archived artifact", async () => {
      const { token } = await issue();
      const archived = await SELF.fetch(
        `https://localhost/programmatic-api/v1/projects/${projectId}/artifacts/${artifactId}/archive`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${await issueAccessToken(OWNER)}`,
          },
        },
      );
      expect(archived.status).toBe(200);
      expect((await fetchContent(token, "index.html")).status).toBe(200);
      expect((await requestToken(OWNER)).status).toBe(200);
    });
  });

  describe("app shell", () => {
    it("does not allow /artifact-content/ as a script source", () => {
      const csp =
        spaIndexHeaders("https://localhost")["Content-Security-Policy"] ?? "";
      expect(csp).toContain("script-src https://localhost/assets/");
      const scriptSrc =
        csp.split(";").find((part) => part.trim().startsWith("script-src")) ??
        "";
      expect(scriptSrc).not.toContain("'self'");
      expect(scriptSrc).not.toContain("artifact-content");
      expect(csp).not.toContain("'unsafe-inline'");
    });

    it("limits frames, and their later navigations, to /artifact-content/", () => {
      const csp =
        spaIndexHeaders("https://localhost")["Content-Security-Policy"] ?? "";
      const frameSrc =
        csp.split(";").find((part) => part.trim().startsWith("frame-src")) ??
        "";
      expect(frameSrc.trim()).toBe(
        "frame-src https://localhost/artifact-content/",
      );
    });
  });
});
