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

  it("reports self-hosted direct creation when no Control Plane is bound", async () => {
    const response = await SELF.fetch(
      "https://localhost/api/billing/entitlement",
      {
        headers: await createAuthHeaders({ sub: "github|self-hosted-user" }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: "self-hosted",
      checkoutEnabled: false,
      projectCreation: "direct",
    });
  });

  it("rejects operations and checkout-based creation when no Control Plane is bound", async () => {
    const headers = await createAuthHeaders({ sub: "github|self-hosted-user" });
    for (const path of [
      "billing/account-operations/manage",
      "project-creation-requests",
    ]) {
      const response = await SELF.fetch(`https://localhost/api/${path}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ name: "A", idempotencyKey: "key-12345678" }),
      });
      expect(response.status).toBe(409);
    }
  });
});
