import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";

describe("billing entitlement route", () => {
  beforeEach(async () => {
    await setupAccessBindings(env);
  });

  it("requires an authenticated user", async () => {
    const response = await SELF.fetch(
      "https://localhost/api/billing/entitlement",
    );

    expect(response.status).toBe(401);
  });

  it("returns unlimited entitlement when no Control Plane is bound", async () => {
    const response = await SELF.fetch(
      "https://localhost/api/billing/entitlement",
      {
        headers: await createAuthHeaders({ sub: "github|self-hosted-user" }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      entitlement: {
        billingAccountId: "github|self-hosted-user",
        plan: "unlimited",
        state: "active",
        limits: { maxOwnedProjects: null },
        validUntil: null,
        revision: 1,
        cache: { maxAgeSeconds: 3600, staleIfErrorSeconds: 86400 },
      },
    });
  });
});
