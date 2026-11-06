import { SELF, env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TERMS_VERSION } from "../src/application/usecases/complete-onboarding";
import { createDb } from "../src/infrastructure/db/client";
import { usersTable } from "../src/infrastructure/db/schema/users";
import { createAccessJwt, setupAccessBindings } from "./helpers/access-jwt";

const accessHeaders = async (sub: string, email: string) => ({
  "Cf-Access-Jwt-Assertion": await createAccessJwt({ sub, email }),
});

type MutableEnv = {
  ENTITLEMENT_MODE?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
};
const mutableEnv = env as unknown as MutableEnv;

const post = async (
  sub: string,
  body: unknown,
  email = `${sub.replace("|", "-")}@example.com`,
) =>
  SELF.fetch("https://localhost/api/onboarding", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await accessHeaders(sub, email)),
    },
    body: JSON.stringify(body),
  });

const userRows = async (id: string) =>
  createDb(env.DB).select().from(usersTable).where(eq(usersTable.id, id));

describe("onboarding route", () => {
  beforeEach(async () => {
    await setupAccessBindings(env);
    delete mutableEnv.ENTITLEMENT_MODE;
    delete mutableEnv.TURNSTILE_SITE_KEY;
    delete mutableEnv.TURNSTILE_SECRET_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports an incomplete onboarding without creating a user", async () => {
    const response = await SELF.fetch("https://localhost/api/onboarding", {
      headers: await accessHeaders("github|new-1", "new-1@example.com"),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      completed: false,
      challenge: { kind: "disabled", siteKey: null },
    });
    expect(await userRows("github|new-1")).toHaveLength(0);
  });

  it("creates an allowed user without a challenge on self-hosted deployments", async () => {
    const response = await post("github|new-2", { acceptedTerms: true });
    expect(response.status).toBe(200);
    const [row] = await userRows("github|new-2");
    expect(row?.accessStatus).toBe("allowed");
    expect(row?.termsAcceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(row?.termsVersion).toBe(TERMS_VERSION);
  });

  it("exposes configured terms and privacy URLs", async () => {
    (mutableEnv as { TERMS_URL?: string; PRIVACY_URL?: string }).TERMS_URL =
      "https://example.com/terms";
    (mutableEnv as { TERMS_URL?: string; PRIVACY_URL?: string }).PRIVACY_URL =
      "https://example.com/privacy";
    try {
      const response = await SELF.fetch("https://localhost/api/onboarding", {
        headers: await accessHeaders("github|new-5", "new-5@example.com"),
      });
      expect(await response.json()).toMatchObject({
        termsUrl: "https://example.com/terms",
        privacyUrl: "https://example.com/privacy",
      });
    } finally {
      delete (mutableEnv as { TERMS_URL?: string }).TERMS_URL;
      delete (mutableEnv as { PRIVACY_URL?: string }).PRIVACY_URL;
    }
  });

  it("requires accepting the terms", async () => {
    const response = await post("github|new-3", { acceptedTerms: false });
    expect(response.status).toBe(400);
    expect(await userRows("github|new-3")).toHaveLength(0);
  });

  it("refuses onboarding on hosted deployments without complete Turnstile config", async () => {
    mutableEnv.ENTITLEMENT_MODE = "control-plane";
    mutableEnv.TURNSTILE_SITE_KEY = "site-key";

    const response = await post("github|new-4", {
      acceptedTerms: true,
      turnstileToken: "token",
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "ONBOARDING_UNAVAILABLE",
    });
    expect(await userRows("github|new-4")).toHaveLength(0);
  });

  describe("with Turnstile configured", () => {
    beforeEach(() => {
      mutableEnv.TURNSTILE_SITE_KEY = "site-key";
      mutableEnv.TURNSTILE_SECRET_KEY = "secret-key";
    });

    const stubSiteverify = (result: Record<string, unknown>) => {
      const original = globalThis.fetch;
      const siteverify = vi.fn(async () => Response.json(result));
      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
          String(input).includes("challenges.cloudflare.com")
            ? siteverify()
            : original(input, init),
        ),
      );
      return siteverify;
    };

    it("exposes the site key but never the secret", async () => {
      const response = await SELF.fetch("https://localhost/api/onboarding", {
        headers: await accessHeaders("github|new-5", "new-5@example.com"),
      });
      const text = await response.text();
      expect(text).toContain("site-key");
      expect(text).not.toContain("secret-key");
    });

    it("rejects a missing token without calling Siteverify", async () => {
      const siteverify = stubSiteverify({ success: true });
      const response = await post("github|new-6", { acceptedTerms: true });
      expect(response.status).toBe(403);
      expect(siteverify).not.toHaveBeenCalled();
      expect(await userRows("github|new-6")).toHaveLength(0);
    });

    it("rejects a failed verification", async () => {
      stubSiteverify({ success: false });
      const response = await post("github|new-7", {
        acceptedTerms: true,
        turnstileToken: "bad",
      });
      expect(response.status).toBe(403);
      expect(await userRows("github|new-7")).toHaveLength(0);
    });

    it("rejects a token issued for another hostname or action", async () => {
      stubSiteverify({
        success: true,
        hostname: "evil.example.com",
        action: "onboarding",
      });
      const wrongHost = await post("github|new-8", {
        acceptedTerms: true,
        turnstileToken: "t",
      });
      expect(wrongHost.status).toBe(403);

      stubSiteverify({
        success: true,
        hostname: "localhost",
        action: "login",
      });
      const wrongAction = await post("github|new-8", {
        acceptedTerms: true,
        turnstileToken: "t",
      });
      expect(wrongAction.status).toBe(403);
      expect(await userRows("github|new-8")).toHaveLength(0);
    });

    it("creates the user after a valid verification", async () => {
      stubSiteverify({
        success: true,
        hostname: "localhost",
        action: "onboarding",
      });
      const response = await post("github|new-9", {
        acceptedTerms: true,
        turnstileToken: "good",
      });
      expect(response.status).toBe(200);
      const [row] = await userRows("github|new-9");
      expect(row?.accessStatus).toBe("allowed");

      const me = await SELF.fetch("https://localhost/api/auth/me", {
        headers: await accessHeaders(
          "github|new-9",
          "github-new-9@example.com",
        ),
      });
      expect(me.status).toBe(200);
    });
  });

  it("does not let a blocked user onboard again", async () => {
    await createDb(env.DB).insert(usersTable).values({
      id: "github|blocked-ob",
      displayName: "b",
      email: "b@example.com",
      accessStatus: "blocked",
    });
    const response = await post("github|blocked-ob", { acceptedTerms: true });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ACCOUNT_BLOCKED" });
  });
});
