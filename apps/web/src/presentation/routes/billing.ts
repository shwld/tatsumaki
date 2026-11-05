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

const isCheckoutEnabled = (bindings: Bindings): boolean =>
  bindings.ENTITLEMENT_MODE === "control-plane" &&
  bindings.CHECKOUT_ENABLED === "true";

export const billingRoute = new Hono<Env>();

billingRoute.get("/billing/entitlement", async (c) => {
  const currentUser = c.get("currentUser");

  try {
    const provider = createEntitlementProvider(c.env);
    const entitlement = await provider.getEntitlement(currentUser.id);
    return c.json({
      entitlement,
      checkoutEnabled: isCheckoutEnabled(c.env),
    });
  } catch (error) {
    console.error("Failed to load entitlement", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return c.json({ error: "Entitlement is temporarily unavailable" }, 503);
  }
});

billingRoute.post("/billing/checkout", async (c) => {
  if (!isCheckoutEnabled(c.env) || !c.env.CONTROL_PLANE) {
    return c.json({ error: "Checkout is not available" }, 409);
  }
  const currentUser = c.get("currentUser");
  const origin = new URL(c.req.url).origin;

  try {
    const session = parseSessionResponse(
      await c.env.CONTROL_PLANE.createCheckoutSession({
        billingAccountId: currentUser.id,
        requestId: crypto.randomUUID(),
        successUrl: `${origin}/account?checkout=success`,
        cancelUrl: `${origin}/account?checkout=cancel`,
      }),
    );
    return c.json({ url: session.url });
  } catch (error) {
    console.error("Failed to create checkout session", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return c.json({ error: "Checkout is temporarily unavailable" }, 503);
  }
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
