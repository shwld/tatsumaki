import { Hono } from "hono";
import type { EntitlementProvider } from "../../application/ports/entitlement-provider";
import {
  ControlPlaneEntitlementProvider,
  parseSessionResponse,
} from "../../infrastructure/entitlements/control-plane-entitlement-provider";
import {
  BILLING_GATEWAY_ERROR,
  listOwnedProjectBilling,
} from "../../application/usecases/list-owned-project-billing";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
import { ControlPlaneProjectBillingGateway } from "../../infrastructure/entitlements/control-plane-project-billing-gateway";
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

billingRoute.get("/billing/subscriptions", async (c) => {
  if (c.env.ENTITLEMENT_MODE !== "control-plane" || !c.env.CONTROL_PLANE) {
    return c.json({ error: "Billing is not available" }, 409);
  }
  const result = await listOwnedProjectBilling(
    new D1ProjectRepository(c.env.DB),
    new ControlPlaneProjectBillingGateway(c.env.CONTROL_PLANE),
    c.get("currentUser").id,
  );
  if (result.isErr()) {
    if (result.error === BILLING_GATEWAY_ERROR) {
      console.error("Failed to list project billing");
      return c.json({ error: "Billing is temporarily unavailable" }, 503);
    }
    return c.json({ error: "Failed to load projects" }, 500);
  }
  return c.json({ projects: result.value });
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
