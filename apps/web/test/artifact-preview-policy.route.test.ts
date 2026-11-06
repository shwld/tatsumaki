import { env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Bindings, Env } from "../src/index";
import type { CurrentUser } from "../src/presentation/middleware/access-auth";
import { artifactContentRoute } from "../src/presentation/routes/artifact-content/routes";
import { artifactPreviewTokenRoute } from "../src/presentation/routes/artifacts/preview-token";
import {
  isArtifactPreviewEnabled,
  isValidArtifactContentOrigin,
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

  it("disables preview when the content origin is invalid", async () => {
    for (const mode of [undefined, "control-plane"]) {
      const response = await requestToken({
        ENTITLEMENT_MODE: mode,
        ARTIFACT_CONTENT_ORIGIN: "https://content.tatsumaki.example",
      });
      expect(await response.json()).toMatchObject({
        code: "ARTIFACT_PREVIEW_DISABLED",
      });
    }
  });

  it("keeps the self-hosting behavior when unset", async () => {
    expect(isArtifactPreviewEnabled({}, APP)).toBe(true);
    const response = await requestToken({ ENTITLEMENT_MODE: undefined });
    expect(await response.json()).not.toMatchObject({
      code: "ARTIFACT_PREVIEW_DISABLED",
    });
  });

  it("enables preview on the official host with a valid content origin", async () => {
    expect(
      isArtifactPreviewEnabled(
        {
          ENTITLEMENT_MODE: "control-plane",
          ARTIFACT_CONTENT_ORIGIN: "https://content.example",
        },
        APP,
      ),
    ).toBe(true);
  });
});
