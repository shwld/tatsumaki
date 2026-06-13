import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/index";
import { devAuth } from "../src/presentation/middleware/dev-auth";

const TEST_ACCESS_AUD = "test-access-audience";
const TEST_JWKS_JSON =
  '{"keys":[{"key_ops":["verify"],"ext":true,"kty":"RSA","n":"puuPKyVCxnuIEolWMa6tTQCX-MdNi7QAdt7DhB_XOpL9vPD9gZK-3JUhVGHmCvrBFJoaBeu72i5CIQ5uFZi2xkx0_m1Wuzd0Cx3ALWIr1gv3w_n1qEAy88LRa2olF7BB74U5dFvdFZc0i1E40xZc5srcFP2QTsqwwRLX-vNjOgLJ15m_xKlXgNSgzDeIA7YZBMPBnkLbpvkMO8JI3dqzQX3mh1cS41GCQFqM9Wi66fVs-6imzMSLdvfbr3BFbn73NT6R1iaq74fHu-y3JLdk42VLymZxHT7cQMLCoyz9mi61jc0lYpOOh8MomQlFwWwBQOb9SkiwPH-mh4M8JI5cNQ","e":"AQAB","alg":"RS256","kid":"test-access-key","use":"sig"}]}';

const JWT_HEADER_NAME = "Cf-Access-Jwt-Assertion";

const createApp = (devAuthEmail?: string) => {
  const app = new Hono<Env>();

  app.use("*", devAuth());
  app.get("/test", (c) => {
    const jwt = c.req.header(JWT_HEADER_NAME);
    return c.json({ hasJwt: !!jwt, jwt });
  });

  return {
    fetch: (url: string, init?: RequestInit) =>
      app.fetch(new Request(url, init), {
        DB: {} as D1Database,
        ASSETS: {} as Fetcher,
        ACCESS_AUD: TEST_ACCESS_AUD,
        ACCESS_TEAM_DOMAIN: "test-team.cloudflareaccess.com",
        ACCESS_JWKS_JSON: TEST_JWKS_JSON,
        DEV_AUTH_EMAIL: devAuthEmail,
      }),
  };
};

describe("dev auth middleware", () => {
  describe("when DEV_AUTH_EMAIL is set", () => {
    it("injects JWT header when none is present", async () => {
      const app = createApp("dev@localhost");
      const response = await app.fetch("http://localhost/test");

      expect(response.status).toBe(200);
      const body = (await response.json()) as { hasJwt: boolean; jwt: string };
      expect(body.hasJwt).toBe(true);
      expect(body.jwt).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });

    it("does not override existing JWT header", async () => {
      const app = createApp("dev@localhost");
      const existingJwt = "existing.jwt.token";
      const response = await app.fetch("http://localhost/test", {
        headers: { [JWT_HEADER_NAME]: existingJwt },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { hasJwt: boolean; jwt: string };
      expect(body.jwt).toBe(existingJwt);
    });
  });

  describe("when DEV_AUTH_EMAIL is not set", () => {
    it("does not inject JWT header", async () => {
      const app = createApp(undefined);
      const response = await app.fetch("http://localhost/test");

      expect(response.status).toBe(200);
      const body = (await response.json()) as { hasJwt: boolean; jwt: string };
      expect(body.hasJwt).toBe(false);
    });
  });
});
