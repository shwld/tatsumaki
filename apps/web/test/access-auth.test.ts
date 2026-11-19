import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUserFromAccessRequest } from "../src/presentation/middleware/access-auth";
import {
  createAccessJwt,
  setupAccessBindings,
  TEST_ACCESS_AUD,
  TEST_ACCESS_ISSUER,
} from "./helpers/access-jwt";

type TestBindings = Parameters<typeof getCurrentUserFromAccessRequest>[1];

const requestWith = (token: string) =>
  new Request("https://example.test/", {
    headers: { "Cf-Access-Jwt-Assertion": token },
  });

const localBindings = (): TestBindings => {
  const bindings: Record<string, string> = {};
  void setupAccessBindings(bindings);
  return bindings as unknown as TestBindings;
};

describe("Access JWT verification (local JWKS)", () => {
  it("accepts a valid token", async () => {
    const user = await getCurrentUserFromAccessRequest(
      requestWith(await createAccessJwt()),
      localBindings(),
    );
    expect(user?.id).toBe("github|test-user");
  });

  it("rejects a tampered token", async () => {
    const token = await createAccessJwt();
    const [h, p, s] = token.split(".");
    const forged = btoa(
      JSON.stringify({
        sub: "attacker",
        aud: [TEST_ACCESS_AUD],
        iss: TEST_ACCESS_ISSUER,
        exp: 9999999999,
      }),
    ).replace(/=+$/g, "");
    expect(
      await getCurrentUserFromAccessRequest(
        requestWith(`${h}.${forged}.${s}`),
        localBindings(),
      ),
    ).toBeNull();
    expect(p).toBeTruthy();
  });

  it.each([
    ["expired", { exp: Math.floor(Date.now() / 1000) - 10 }],
    ["audience mismatch", { aud: ["other"] }],
    ["issuer mismatch", { iss: "https://evil.cloudflareaccess.com" }],
    ["future nbf", { nbf: Math.floor(Date.now() / 1000) + 3600 }],
    ["missing sub", { sub: undefined }],
  ])("rejects %s", async (_name, overrides) => {
    const token = await createAccessJwt(overrides);
    expect(
      await getCurrentUserFromAccessRequest(
        requestWith(token),
        localBindings(),
      ),
    ).toBeNull();
  });

  it("rejects unknown kid", async () => {
    const token = await createAccessJwt({ kid: "unknown" });
    expect(
      await getCurrentUserFromAccessRequest(
        requestWith(token),
        localBindings(),
      ),
    ).toBeNull();
  });
});

describe("Access JWT verification (remote JWKS)", () => {
  let domainSeq = 0;
  let publicJwk: JWK;
  let privateKey: CryptoKey;
  let newPublicJwk: JWK;
  let newPrivateKey: CryptoKey;
  let jwksResponse: { keys: JWK[] };
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const sign = (key: CryptoKey, kid: string, domain: string) =>
    new SignJWT({ email: "tester@example.com" })
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuer(`https://${domain}`)
      .setAudience(TEST_ACCESS_AUD)
      .setSubject("github|test-user")
      .setExpirationTime("5m")
      .sign(key);

  const bindingsFor = (domain: string) =>
    ({
      ACCESS_AUD: TEST_ACCESS_AUD,
      ACCESS_TEAM_DOMAIN: domain,
    }) as unknown as TestBindings;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const oldPair = await generateKeyPair("RS256", { extractable: true });
    const newPair = await generateKeyPair("RS256", { extractable: true });
    privateKey = oldPair.privateKey;
    newPrivateKey = newPair.privateKey;
    publicJwk = {
      ...(await exportJWK(oldPair.publicKey)),
      kid: "old",
      alg: "RS256",
      use: "sig",
    };
    newPublicJwk = {
      ...(await exportJWK(newPair.publicKey)),
      kid: "new",
      alg: "RS256",
      use: "sig",
    };
    jwksResponse = { keys: [publicJwk] };
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json(jwksResponse));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it("verifies a token signed by a rotated-in key after the cooldown, within the cache TTL", async () => {
    const domain = `rotate-${(domainSeq += 1)}.example.test`;
    const bindings = bindingsFor(domain);

    const oldToken = await sign(privateKey, "old", domain);
    expect(
      (await getCurrentUserFromAccessRequest(requestWith(oldToken), bindings))
        ?.id,
    ).toBe("github|test-user");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    jwksResponse = { keys: [publicJwk, newPublicJwk] };
    const newToken = await sign(newPrivateKey, "new", domain);

    vi.setSystemTime(Date.now() + 60 * 1000);
    expect(
      (await getCurrentUserFromAccessRequest(requestWith(newToken), bindings))
        ?.id,
    ).toBe("github|test-user");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not amplify fetches for repeated or concurrent unknown kids", async () => {
    const domain = `flood-${(domainSeq += 1)}.example.test`;
    const bindings = bindingsFor(domain);
    const oldToken = await sign(privateKey, "old", domain);
    await getCurrentUserFromAccessRequest(requestWith(oldToken), bindings);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const bogus = await sign(newPrivateKey, "bogus", domain);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        getCurrentUserFromAccessRequest(requestWith(bogus), bindings),
      ),
    );
    expect(results.every((r) => r === null)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + 60 * 1000);
    const burst = await Promise.all(
      Array.from({ length: 20 }, () =>
        getCurrentUserFromAccessRequest(requestWith(bogus), bindings),
      ),
    );
    expect(burst.every((r) => r === null)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("accepts concurrent valid requests on a cold cache", async () => {
    const domain = `cold-${(domainSeq += 1)}.example.test`;
    const bindings = bindingsFor(domain);
    const token = await sign(privateKey, "old", domain);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        getCurrentUserFromAccessRequest(requestWith(token), bindings),
      ),
    );
    expect(results.every((r) => r?.id === "github|test-user")).toBe(true);
  });

  it("rejects when the JWKS fetch fails", async () => {
    const domain = `fail-${(domainSeq += 1)}.example.test`;
    fetchSpy.mockImplementation(
      async () => new Response("boom", { status: 500 }),
    );
    const token = await sign(privateKey, "old", domain);
    expect(
      await getCurrentUserFromAccessRequest(
        requestWith(token),
        bindingsFor(domain),
      ),
    ).toBeNull();
  });
});
