import { describe, expect, it, vi } from "vitest";
import { ControlPlaneEntitlementProvider } from "../src/infrastructure/entitlements/control-plane-entitlement-provider";
import { UnlimitedEntitlementProvider } from "../src/infrastructure/entitlements/unlimited-entitlement-provider";
import { createEntitlementProvider } from "../src/presentation/routes/billing";

const bindings = {
  DB: {} as D1Database,
  ASSETS: {} as Fetcher,
  PLANNING_POKER_DO: {} as DurableObjectNamespace,
  STORY_MAP_DO: {} as DurableObjectNamespace,
};

const projectEntitlement = (overrides: Record<string, unknown> = {}) => ({
  projectId: "project-1",
  state: "active",
  validUntil: null,
  revision: 1,
  cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
  ...overrides,
});

describe("ControlPlaneEntitlementProvider", () => {
  it("asks the Control Plane about the project, not the user", async () => {
    const getProjectEntitlement = vi.fn(async () => projectEntitlement());
    const provider = new ControlPlaneEntitlementProvider({
      getProjectEntitlement,
    });

    await expect(provider.getProjectEntitlement("project-1")).resolves.toEqual(
      projectEntitlement(),
    );
    expect(getProjectEntitlement).toHaveBeenCalledWith({
      projectId: "project-1",
    });
  });

  it.each([
    "active",
    "grace",
    "suspended",
  ])("accepts the %s state", async (state) => {
    const provider = new ControlPlaneEntitlementProvider({
      getProjectEntitlement: vi.fn(async () => projectEntitlement({ state })),
    });
    await expect(
      provider.getProjectEntitlement("project-1"),
    ).resolves.toMatchObject({ state });
  });

  it("rejects an invalid state at the adapter boundary", async () => {
    const provider = new ControlPlaneEntitlementProvider({
      getProjectEntitlement: vi.fn(async () =>
        projectEntitlement({ state: "restricted" }),
      ),
    });
    await expect(provider.getProjectEntitlement("project-1")).rejects.toThrow();
  });

  it("rejects an entitlement for a different project", async () => {
    const provider = new ControlPlaneEntitlementProvider({
      getProjectEntitlement: vi.fn(async () =>
        projectEntitlement({ projectId: "other-project" }),
      ),
    });
    await expect(provider.getProjectEntitlement("project-1")).rejects.toThrow(
      "different project",
    );
  });
});

describe("UnlimitedEntitlementProvider", () => {
  it("keeps every project active for self-hosting", async () => {
    await expect(
      new UnlimitedEntitlementProvider().getProjectEntitlement("project-1"),
    ).resolves.toMatchObject({ projectId: "project-1", state: "active" });
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
        CONTROL_PLANE: {
          getProjectEntitlement: vi.fn(),
          createCheckoutSession: vi.fn(),
          listProjectBilling: vi.fn(),
          createSubscriptionCancelSession: vi.fn(),
          createPaymentMethodUpdateSession: vi.fn(),
          closeProjectBilling: vi.fn(),
          expireTransferCheckout: vi.fn(),
          syncProjectDisplayNames: vi.fn(),
          createPortalSession: vi.fn(),
        },
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
