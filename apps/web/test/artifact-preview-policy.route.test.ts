import { env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Bindings, Env } from "../src/index";
import type { CurrentUser } from "../src/presentation/middleware/access-auth";
import { artifactContentRoute } from "../src/presentation/routes/artifact-content/routes";
import { artifactPreviewTokenRoute } from "../src/presentation/routes/artifacts/preview-token";
import { routeByContentHost } from "../src/presentation/artifact-content-host";
import {
  isArtifactPreviewEnabled,
  isValidArtifactContentOrigin,
  resolveArtifactContentConfig,
} from "../src/presentation/routes/artifacts/preview-policy";

const APP = "https://tatsumaki.example";

const buildApp = () => {
  const app = new Hono<Env>();
  app.use(async (c, next) => {
    c.set("currentUser", { id: "user-1" } as CurrentUser);
    await next();
  });
  app.route("/api", artifactPreviewTokenRoute);
  app.route("/", artifactContentRoute);
  return app;
};

const bindings = (overrides: Partial<Bindings>): Bindings =>
  ({ ...env, ...overrides }) as Bindings;

const requestToken = (overrides: Partial<Bindings>) =>
  buildApp().request(
    `${APP}/api/projects/p1/artifacts/a1/versions/1/preview-token`,
    { method: "POST" },
    bindings(overrides),
  );

const requestContent = (overrides: Partial<Bindings>) =>
  buildApp().request(
    `${APP}/artifact-content/token/index.html`,
    {
      headers: { "Sec-Fetch-Dest": "iframe", "Sec-Fetch-Site": "same-origin" },
    },
    bindings(overrides),
  );

describe("isValidArtifactContentOrigin", () => {
  it("accepts a different registrable domain", () => {
    expect(
      isValidArtifactContentOrigin(
        "https://content.example",
        "tatsumaki.example.com",
      ),
    ).toBe(true);
  });

  it.each([
    ["the same host", "https://tatsumaki.example"],
    ["a subdomain of the app host", "https://content.tatsumaki.example"],
    ["a parent of the app host", "https://example"],
    ["a different scheme", "http://content.example"],
    ["a path", "https://content.example/x"],
    ["a trailing slash", "https://content.example/"],
    ["garbage", "not a url"],
  ])("rejects %s", (_name, value) => {
    expect(isValidArtifactContentOrigin(value, "tatsumaki.example")).toBe(
      false,
    );
  });
});

const SPLIT = {
  ARTIFACT_APP_ORIGIN: APP,
  ARTIFACT_CONTENT_ORIGIN: "https://content.example",
};

describe("isValidArtifactContentOrigin sibling hosts", () => {
  it("rejects a sibling subdomain of the same registrable domain", () => {
    expect(
      isValidArtifactContentOrigin(
        "https://content.example.com",
        "app.example.com",
      ),
    ).toBe(false);
  });

  it("treats a public suffix like workers.dev as a boundary", () => {
    expect(
      isValidArtifactContentOrigin(
        "https://content.workers.dev",
        "app.acct.workers.dev",
      ),
    ).toBe(true);
    expect(
      isValidArtifactContentOrigin(
        "https://content.acct.workers.dev",
        "app.acct.workers.dev",
      ),
    ).toBe(false);
  });
});

describe("artifact preview fail-closed (ADR-0012 §5)", () => {
  it("disables preview on the official host without a content origin", async () => {
    const response = await requestToken({ ENTITLEMENT_MODE: "control-plane" });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: "ARTIFACT_PREVIEW_DISABLED",
    });

    const content = await requestContent({ ENTITLEMENT_MODE: "control-plane" });
    expect(content.status).toBe(404);
  });

  it.each([
    [
      "a subdomain of the app",
      { ARTIFACT_CONTENT_ORIGIN: "https://content.tatsumaki.example" },
    ],
    [
      "a missing app origin",
      {
        ARTIFACT_APP_ORIGIN: undefined,
        ARTIFACT_CONTENT_ORIGIN: "https://content.example",
      },
    ],
    [
      "an http content origin",
      { ...SPLIT, ARTIFACT_CONTENT_ORIGIN: "http://content.example" },
    ],
  ])("disables preview for %s in every mode", async (_name, vars) => {
    for (const mode of [undefined, "control-plane"]) {
      const response = await requestToken({
        ENTITLEMENT_MODE: mode,
        ARTIFACT_APP_ORIGIN: APP,
        ...vars,
      });
      expect(await response.json()).toMatchObject({
        code: "ARTIFACT_PREVIEW_DISABLED",
      });
    }
  });

  it("keeps the self-hosting behavior when unset", async () => {
    expect(isArtifactPreviewEnabled({})).toBe(true);
    const response = await requestToken({ ENTITLEMENT_MODE: undefined });
    expect(await response.json()).not.toMatchObject({
      code: "ARTIFACT_PREVIEW_DISABLED",
    });
  });

  it("enables preview on the official host with valid origins", () => {
    expect(
      isArtifactPreviewEnabled({ ENTITLEMENT_MODE: "control-plane", ...SPLIT }),
    ).toBe(true);
  });
});

describe("resolveArtifactContentConfig", () => {
  it("allows plain http only for loopback hosts", () => {
    expect(
      resolveArtifactContentConfig({
        ARTIFACT_APP_ORIGIN: "http://127.0.0.1:8788",
        ARTIFACT_CONTENT_ORIGIN: "http://localhost:8788",
      }),
    ).toEqual({
      mode: "split",
      appOrigin: "http://127.0.0.1:8788",
      contentOrigin: "http://localhost:8788",
    });
  });
});

describe("content host routing (ADR-0012 §2)", () => {
  const ctx = { waitUntil() {}, passThroughOnException() {} } as never;
  const route = (url: string, overrides: Partial<Bindings>) =>
    routeByContentHost(new Request(url), bindings(overrides), ctx);

  it("serves nothing but /artifact-content/ on the content host", async () => {
    for (const path of [
      "/",
      "/api/projects",
      "/login",
      "/oauth/token",
      "/assets/x.js",
    ]) {
      const response = await route(`https://content.example${path}`, SPLIT);
      expect(response?.status).toBe(404);
      expect(response?.headers.get("set-cookie")).toBeNull();
    }
  });

  it("does not hand the content host to the app (no SPA, auth or session)", async () => {
    const response = await route(
      "https://content.example/artifact-content/bad/index.html",
      SPLIT,
    );
    expect(response?.status).toBe(404);
    expect(response?.headers.get("content-security-policy")).toContain(
      `frame-ancestors ${APP}`,
    );
  });

  it("returns 404 for /artifact-content/ on the app host", async () => {
    const response = await route(`${APP}/artifact-content/t/index.html`, SPLIT);
    expect(response?.status).toBe(404);
  });

  it("leaves other app host paths to the app", async () => {
    const assets = {
      fetch: async () => new Response("Not found", { status: 404 }),
    };
    expect(
      await route(`${APP}/api/projects`, { ...SPLIT, ASSETS: assets as never }),
    ).toBeNull();
  });

  it("serves static assets from the asset binding on the app host only", async () => {
    const assets = {
      fetch: async (request: Request) =>
        new URL(request.url).pathname === "/assets/app.js"
          ? new Response("bundle", { status: 200 })
          : new Response("Not found", { status: 404 }),
    };
    const overrides = { ...SPLIT, ASSETS: assets as never };
    const served = await route(`${APP}/assets/app.js`, overrides);
    expect(served?.status).toBe(200);
    expect(await route(`${APP}/`, overrides)).toBeNull();
    expect(
      (await route("https://content.example/assets/app.js", overrides))?.status,
    ).toBe(404);
  });

  it("changes nothing when unset", async () => {
    expect(await route(`${APP}/artifact-content/t/index.html`, {})).toBeNull();
    expect(await route("https://content.example/", {})).toBeNull();
  });

  it("ignores cookies and never sets one on the content host", async () => {
    const response = await routeByContentHost(
      new Request("https://content.example/artifact-content/bad/index.html", {
        headers: {
          Cookie: "CF_Authorization=secret",
          "Sec-Fetch-Dest": "iframe",
        },
      }),
      bindings(SPLIT),
      ctx,
    );
    expect(response?.status).toBe(404);
    expect(response?.headers.get("set-cookie")).toBeNull();
  });
});
