import { Hono } from "hono";
import type { EntitlementProvider } from "../../application/ports/entitlement-provider";
import { ControlPlaneEntitlementProvider } from "../../infrastructure/entitlements/control-plane-entitlement-provider";
import { UnlimitedEntitlementProvider } from "../../infrastructure/entitlements/unlimited-entitlement-provider";
import type { Bindings, Env } from "../../index";

export const createEntitlementProvider = (
  bindings: Bindings,
): EntitlementProvider => {
  if (bindings.ENTITLEMENT_MODE === "control-plane") {
    if (!bindings.CONTROL_PLANE) {
      throw new Error(
        "CONTROL_PLANE binding is required in control-plane entitlement mode",
      );
    }
    return new ControlPlaneEntitlementProvider(bindings.CONTROL_PLANE);
  }
  if (bindings.ENTITLEMENT_MODE !== undefined) {
    throw new Error(
      `Unsupported entitlement mode: ${bindings.ENTITLEMENT_MODE}`,
    );
  }
  return new UnlimitedEntitlementProvider();
};

export const billingRoute = new Hono<Env>();

billingRoute.get("/billing/entitlement", async (c) => {
  const currentUser = c.get("currentUser");

  try {
    const provider = createEntitlementProvider(c.env);
    const entitlement = await provider.getEntitlement(currentUser.id);
    return c.json({ entitlement });
  } catch (error) {
    console.error("Failed to load entitlement", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return c.json({ error: "Entitlement is temporarily unavailable" }, 503);
  }
});
