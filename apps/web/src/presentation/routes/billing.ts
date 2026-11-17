import { Hono } from "hono";
import type { EntitlementProvider } from "../../application/ports/entitlement-provider";
import {
  ControlPlaneEntitlementProvider,
  parseSessionResponse,
} from "../../infrastructure/entitlements/control-plane-entitlement-provider";
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

export const isCheckoutEnabled = (bindings: Bindings): boolean =>
  bindings.ENTITLEMENT_MODE === "control-plane" &&
  bindings.CHECKOUT_ENABLED === "true";

export const billingRoute = new Hono<Env>();

billingRoute.get("/billing/entitlement", (c) => {
  const controlPlane = c.env.ENTITLEMENT_MODE === "control-plane";
  const checkoutEnabled = isCheckoutEnabled(c.env);
  return c.json({
    mode: controlPlane ? "control-plane" : "self-hosted",
    checkoutEnabled,
    projectCreation: !controlPlane
      ? "direct"
      : checkoutEnabled
        ? "checkout"
        : "disabled",
  });
});

billingRoute.post("/billing/portal", async (c) => {
  if (c.env.ENTITLEMENT_MODE !== "control-plane" || !c.env.CONTROL_PLANE) {
    return c.json({ error: "Billing portal is not available" }, 409);
  }
  const currentUser = c.get("currentUser");
  const origin = new URL(c.req.url).origin;

  try {
    const session = parseSessionResponse(
      await c.env.CONTROL_PLANE.createPortalSession({
        billingAccountId: currentUser.id,
        returnUrl: `${origin}/account`,
      }),
    );
    return c.json({ url: session.url });
  } catch (error) {
    console.error("Failed to create portal session", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return c.json({ error: "Billing portal is temporarily unavailable" }, 503);
  }
});
