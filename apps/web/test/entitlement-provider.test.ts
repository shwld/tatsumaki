import { describe, expect, it, vi } from "vitest";
import { ControlPlaneEntitlementProvider } from "../src/infrastructure/entitlements/control-plane-entitlement-provider";
import { UnlimitedEntitlementProvider } from "../src/infrastructure/entitlements/unlimited-entitlement-provider";
import { createEntitlementProvider } from "../src/presentation/routes/billing";

const bindings = {
  DB: {} as D1Database,
  ASSETS: {} as Fetcher,
  PLANNING_POKER_DO: {} as DurableObjectNamespace,
};

describe("ControlPlaneEntitlementProvider", () => {
  it("calls the Service Binding RPC with the opaque billing account id", async () => {
    const getEntitlement = vi.fn(async () => ({
      billingAccountId: "user-123",
      plan: "free",
      state: "active",
      limits: { maxOwnedProjects: 3 },
      validUntil: null,
      revision: 1,
      cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
    }));
    const provider = new ControlPlaneEntitlementProvider({ getEntitlement });

    await expect(provider.getEntitlement("user-123")).resolves.toEqual({
      billingAccountId: "user-123",
      plan: "free",
      state: "active",
      limits: { maxOwnedProjects: 3 },
      validUntil: null,
      revision: 1,
      cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
    });
    expect(getEntitlement).toHaveBeenCalledWith({
      billingAccountId: "user-123",
    });
  });

  it("rejects an invalid RPC response at the adapter boundary", async () => {
    const provider = new ControlPlaneEntitlementProvider({
      getEntitlement: vi.fn(async () => ({
        billingAccountId: "user-123",
        plan: "enterprise",
      })),
    });

    await expect(provider.getEntitlement("user-123")).rejects.toThrow();
  });

  it("rejects an entitlement for a different billing account", async () => {
    const provider = new ControlPlaneEntitlementProvider({
      getEntitlement: vi.fn(async () => ({
        billingAccountId: "other-user",
        plan: "free",
        state: "active",
        limits: { maxOwnedProjects: 3 },
        validUntil: null,
        revision: 1,
        cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
      })),
    });

    await expect(provider.getEntitlement("user-123")).rejects.toThrow(
      "different billing account",
    );
  });
});

describe("createEntitlementProvider", () => {
  it("uses the local unlimited provider when no hosted mode is configured", () => {
    expect(createEntitlementProvider(bindings)).toBeInstanceOf(
      UnlimitedEntitlementProvider,
    );
  });

  it("uses the RPC provider only when hosted mode and binding are both present", () => {
    expect(
      createEntitlementProvider({
        ...bindings,
        ENTITLEMENT_MODE: "control-plane",
        CONTROL_PLANE: { getEntitlement: vi.fn() },
      }),
    ).toBeInstanceOf(ControlPlaneEntitlementProvider);
  });

  it("fails closed when hosted mode loses its Service Binding", () => {
    expect(() =>
      createEntitlementProvider({
        ...bindings,
        ENTITLEMENT_MODE: "control-plane",
      }),
    ).toThrow("CONTROL_PLANE binding is required");
  });
});
