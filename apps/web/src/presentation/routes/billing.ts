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
import {
  RESUME_CHECKOUT_DISABLED_ERROR,
  RESUME_FORBIDDEN_ERROR,
  RESUME_NOT_FOUND_ERROR,
  RESUME_NOT_SUSPENDED_ERROR,
  RESUME_PAYMENT_ACTION_REQUIRED_ERROR,
  RESUME_PROJECT_DELETING_ERROR,
  resumeProjectSubscription,
} from "../../application/usecases/resume-project-subscription";
import {
  CANCEL_ALREADY_SCHEDULED_ERROR,
  CANCEL_FORBIDDEN_ERROR,
  CANCEL_NO_SUBSCRIPTION_ERROR,
  CANCEL_NOT_FOUND_ERROR,
  startProjectSubscriptionCancel,
} from "../../application/usecases/start-project-subscription-cancel";
import {
  closeOwnershipTransfer,
  getOwnershipTransfer,
  requestOwnershipTransfer,
  TRANSFER_ALREADY_PENDING_ERROR,
  TRANSFER_FORBIDDEN_ERROR,
  TRANSFER_INVALID_RECIPIENT_ERROR,
  TRANSFER_NO_SUBSCRIPTION_ERROR,
  TRANSFER_NOT_FOUND_ERROR,
  TRANSFER_NOT_PENDING_ERROR,
  type OwnershipTransferError,
} from "../../application/usecases/ownership-transfer";
import { D1ProjectOwnershipTransferRepository } from "../../infrastructure/db/repositories/d1-project-ownership-transfer-repository";
import {
  PAYMENT_METHOD_FORBIDDEN_ERROR,
  PAYMENT_METHOD_NO_SUBSCRIPTION_ERROR,
  PAYMENT_METHOD_NOT_FOUND_ERROR,
  startPaymentMethodUpdate,
} from "../../application/usecases/start-payment-method-update";
import { ControlPlanePaymentMethodGateway } from "../../infrastructure/entitlements/control-plane-payment-method-gateway";
import { ControlPlaneSubscriptionCancelGateway } from "../../infrastructure/entitlements/control-plane-subscription-cancel-gateway";
import type { ProjectBillingCloseGateway } from "../../application/ports/project-billing-close-gateway";
import type { ProjectDisplayNameGateway } from "../../application/ports/project-display-name-gateway";
import { ControlPlaneProjectDisplayNameGateway } from "../../infrastructure/entitlements/control-plane-project-display-name-gateway";
import { ControlPlaneProjectBillingCloseGateway } from "../../infrastructure/entitlements/control-plane-project-billing-close-gateway";
import { ControlPlaneCheckoutGateway } from "../../infrastructure/entitlements/control-plane-checkout-gateway";
import { D1ProjectDeletionRequestRepository } from "../../infrastructure/db/repositories/d1-project-deletion-request-repository";
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

/** セルフホストは課金 RPC を呼ばないため undefined。 */
export const createProjectBillingCloseGateway = (
  bindings: Bindings,
): ProjectBillingCloseGateway | undefined => {
  if (bindings.ENTITLEMENT_MODE !== "control-plane") return undefined;
  if (!bindings.CONTROL_PLANE) {
    throw new Error(
      "CONTROL_PLANE binding is required in control-plane entitlement mode",
    );
  }
  return new ControlPlaneProjectBillingCloseGateway(bindings.CONTROL_PLANE);
};

/** セルフホストは課金 RPC を呼ばないため undefined。 */
export const createProjectDisplayNameGateway = (
  bindings: Bindings,
): ProjectDisplayNameGateway | undefined =>
  bindings.ENTITLEMENT_MODE === "control-plane" && bindings.CONTROL_PLANE
    ? new ControlPlaneProjectDisplayNameGateway(bindings.CONTROL_PLANE)
    : undefined;

export const createDeleteProjectBilling = (bindings: Bindings) => {
  const gateway = createProjectBillingCloseGateway(bindings);
  return gateway
    ? {
        requests: new D1ProjectDeletionRequestRepository(bindings.DB),
        gateway,
      }
    : undefined;
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
    createProjectDisplayNameGateway(c.env),
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

// /projects/:projectId 配下に置くと停止中の書き込みゲートに止められるため、別パスにする。
billingRoute.post("/billing/projects/:projectId/resume", async (c) => {
  if (c.env.ENTITLEMENT_MODE !== "control-plane" || !c.env.CONTROL_PLANE) {
    return c.json({ error: "Billing is not available" }, 409);
  }
  const projectId = c.req.param("projectId");
  const origin = new URL(c.req.url).origin;
  const base = `${origin}/projects/${encodeURIComponent(projectId)}`;

  const result = await resumeProjectSubscription(
    {
      projects: new D1ProjectRepository(c.env.DB),
      deletions: new D1ProjectDeletionRequestRepository(c.env.DB),
      entitlements: createEntitlementProvider(c.env),
      billing: new ControlPlaneProjectBillingGateway(c.env.CONTROL_PLANE),
      checkout: new ControlPlaneCheckoutGateway(c.env.CONTROL_PLANE),
    },
    {
      userId: c.get("currentUser").id,
      projectId,
      now: new Date(),
      successUrl: `${base}?billing=resume`,
      cancelUrl: `${base}?billing=resume-cancel`,
    },
    isCheckoutEnabled(c.env),
  );

  if (result.isOk()) return c.json({ url: result.value.url }, 201);
  switch (result.error) {
    case RESUME_NOT_FOUND_ERROR:
      return c.json({ error: "Project not found" }, 404);
    case RESUME_FORBIDDEN_ERROR:
      return c.json({ error: "Only the owner can resume" }, 403);
    case RESUME_NOT_SUSPENDED_ERROR:
      return c.json(
        { error: "Project is not suspended", code: "not_suspended" },
        409,
      );
    case RESUME_PAYMENT_ACTION_REQUIRED_ERROR:
      return c.json(
        { error: "Payment needs attention", code: "payment_action_required" },
        409,
      );
    case RESUME_PROJECT_DELETING_ERROR:
      return c.json(
        { error: "Project is being deleted", code: "project_deleting" },
        409,
      );
    case RESUME_CHECKOUT_DISABLED_ERROR:
      return c.json(
        { error: "Checkout is not available", code: "checkout_disabled" },
        409,
      );
    default:
      console.error("Failed to start project resume", { reason: result.error });
      return c.json({ error: "Resume is temporarily unavailable" }, 503);
  }
});

billingRoute.post("/billing/projects/:projectId/cancel", async (c) => {
  if (c.env.ENTITLEMENT_MODE !== "control-plane" || !c.env.CONTROL_PLANE) {
    return c.json({ error: "Billing is not available" }, 409);
  }
  const projectId = c.req.param("projectId");
  const origin = new URL(c.req.url).origin;
  const returnPath =
    c.req.query("from") === "settings"
      ? `/projects/${encodeURIComponent(projectId)}/settings`
      : "/account";

  const result = await startProjectSubscriptionCancel(
    {
      projects: new D1ProjectRepository(c.env.DB),
      billing: new ControlPlaneProjectBillingGateway(c.env.CONTROL_PLANE),
      cancel: new ControlPlaneSubscriptionCancelGateway(c.env.CONTROL_PLANE),
    },
    {
      userId: c.get("currentUser").id,
      projectId,
      returnUrl: `${origin}${returnPath}?billing=cancel`,
    },
  );

  if (result.isOk()) return c.json({ url: result.value.url }, 201);
  switch (result.error) {
    case CANCEL_NOT_FOUND_ERROR:
      return c.json({ error: "Project not found" }, 404);
    case CANCEL_FORBIDDEN_ERROR:
      return c.json({ error: "Only the owner can cancel" }, 403);
    case CANCEL_NO_SUBSCRIPTION_ERROR:
      return c.json(
        { error: "No active subscription", code: "no_subscription" },
        409,
      );
    case CANCEL_ALREADY_SCHEDULED_ERROR:
      return c.json(
        {
          error: "Cancellation is already scheduled",
          code: "already_scheduled",
        },
        409,
      );
    default:
      console.error("Failed to start subscription cancellation", {
        reason: result.error,
      });
      return c.json({ error: "Cancellation is temporarily unavailable" }, 503);
  }
});

billingRoute.post("/billing/projects/:projectId/payment-method", async (c) => {
  if (c.env.ENTITLEMENT_MODE !== "control-plane" || !c.env.CONTROL_PLANE) {
    return c.json({ error: "Billing is not available" }, 409);
  }
  const projectId = c.req.param("projectId");
  const origin = new URL(c.req.url).origin;

  const result = await startPaymentMethodUpdate(
    {
      projects: new D1ProjectRepository(c.env.DB),
      billing: new ControlPlaneProjectBillingGateway(c.env.CONTROL_PLANE),
      paymentMethod: new ControlPlanePaymentMethodGateway(c.env.CONTROL_PLANE),
    },
    {
      userId: c.get("currentUser").id,
      projectId,
      returnUrl: `${origin}/projects/${encodeURIComponent(projectId)}/settings?billing=payment-method`,
    },
  );

  if (result.isOk()) return c.json({ url: result.value.url }, 201);
  switch (result.error) {
    case PAYMENT_METHOD_NOT_FOUND_ERROR:
      return c.json({ error: "Project not found" }, 404);
    case PAYMENT_METHOD_FORBIDDEN_ERROR:
      return c.json({ error: "Only the owner can manage payment" }, 403);
    case PAYMENT_METHOD_NO_SUBSCRIPTION_ERROR:
      return c.json(
        { error: "No active subscription", code: "no_subscription" },
        409,
      );
    default:
      console.error("Failed to start payment method update", {
        reason: result.error,
      });
      return c.json(
        { error: "Payment update is temporarily unavailable" },
        503,
      );
  }
});

const ownershipTransferErrorResponse = (error: OwnershipTransferError) => {
  switch (error) {
    case TRANSFER_NOT_FOUND_ERROR:
      return { body: { error: "Project not found" }, status: 404 as const };
    case TRANSFER_FORBIDDEN_ERROR:
      return {
        body: { error: "Not allowed for this transfer" },
        status: 403 as const,
      };
    case TRANSFER_INVALID_RECIPIENT_ERROR:
      return {
        body: {
          error: "Recipient must be another member of the project",
          code: "invalid_recipient",
        },
        status: 422 as const,
      };
    case TRANSFER_NO_SUBSCRIPTION_ERROR:
      return {
        body: { error: "No active subscription", code: "no_subscription" },
        status: 409 as const,
      };
    case TRANSFER_ALREADY_PENDING_ERROR:
      return {
        body: {
          error: "A transfer is already pending",
          code: "already_pending",
        },
        status: 409 as const,
      };
    case TRANSFER_NOT_PENDING_ERROR:
      return {
        body: { error: "No pending transfer", code: "not_pending" },
        status: 409 as const,
      };
    default:
      console.error("Ownership transfer unavailable", { reason: error });
      return {
        body: { error: "Ownership transfer is temporarily unavailable" },
        status: 503 as const,
      };
  }
};

// セルフホストは従来のロール操作を維持するため、課金付き譲渡は公式ホスト版だけ。
billingRoute.use(
  "/billing/projects/:projectId/ownership-transfer/*",
  async (c, next) => {
    if (c.env.ENTITLEMENT_MODE !== "control-plane" || !c.env.CONTROL_PLANE) {
      return c.json({ error: "Billing is not available" }, 409);
    }
    await next();
  },
);
billingRoute.get(
  "/billing/projects/:projectId/ownership-transfer",
  async (c) => {
    const result = await getOwnershipTransfer(
      {
        projects: new D1ProjectRepository(c.env.DB),
        transfers: new D1ProjectOwnershipTransferRepository(c.env.DB),
      },
      {
        userId: c.get("currentUser").id,
        projectId: c.req.param("projectId"),
        now: new Date(),
      },
    );
    if (result.isErr()) {
      const { body, status } = ownershipTransferErrorResponse(result.error);
      return c.json(body, status);
    }
    return c.json({ transfer: result.value });
  },
);

billingRoute.post(
  "/billing/projects/:projectId/ownership-transfer",
  async (c) => {
    const controlPlane = c.env.CONTROL_PLANE;
    if (!controlPlane)
      return c.json({ error: "Billing is not available" }, 409);
    const body = (await c.req.json().catch(() => null)) as {
      toUserId?: unknown;
    } | null;
    if (!body || typeof body.toUserId !== "string" || body.toUserId === "") {
      return c.json({ error: "toUserId is required" }, 400);
    }
    const result = await requestOwnershipTransfer(
      {
        projects: new D1ProjectRepository(c.env.DB),
        transfers: new D1ProjectOwnershipTransferRepository(c.env.DB),
        billing: new ControlPlaneProjectBillingGateway(controlPlane),
      },
      {
        userId: c.get("currentUser").id,
        projectId: c.req.param("projectId"),
        toUserId: body.toUserId,
        now: new Date(),
      },
    );
    if (result.isErr()) {
      const response = ownershipTransferErrorResponse(result.error);
      return c.json(response.body, response.status);
    }
    return c.json({ transfer: result.value }, 201);
  },
);

for (const [path, as] of [
  ["cancel", "requester"],
  ["decline", "recipient"],
] as const) {
  billingRoute.post(
    `/billing/projects/:projectId/ownership-transfer/${path}`,
    async (c) => {
      const result = await closeOwnershipTransfer(
        {
          projects: new D1ProjectRepository(c.env.DB),
          transfers: new D1ProjectOwnershipTransferRepository(c.env.DB),
        },
        {
          userId: c.get("currentUser").id,
          projectId: c.req.param("projectId"),
          as,
          now: new Date(),
        },
      );
      if (result.isErr()) {
        const response = ownershipTransferErrorResponse(result.error);
        return c.json(response.body, response.status);
      }
      return c.json({ ok: true });
    },
  );
}
