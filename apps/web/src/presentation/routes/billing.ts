import { Hono } from "hono";
import type { EntitlementProvider } from "../../application/ports/entitlement-provider";
import { ControlPlaneEntitlementProvider } from "../../infrastructure/entitlements/control-plane-entitlement-provider";
import { listOwnedProjectUsage } from "../../application/usecases/list-owned-project-usage";
import {
  OPERATION_FORBIDDEN_ERROR,
  OPERATION_NOT_FOUND_ERROR,
  OPERATION_NOT_OFFERED_ERROR,
  OPERATION_PROJECT_DELETING_ERROR,
  startProjectOperation,
} from "../../application/usecases/start-project-operation";
import { isProjectOperation } from "../../domain/entities/project-operation";
import { ControlPlaneOperationsGateway } from "../../infrastructure/entitlements/control-plane-operations-gateway";
import { getProjectAccessState } from "../../infrastructure/entitlements/project-write-guard";
import {
  closeOwnershipTransfer,
  getOwnershipTransfer,
  requestOwnershipTransfer,
  startTransferCheckout,
  TRANSFER_ALREADY_PENDING_ERROR,
  TRANSFER_CHECKOUT_DISABLED_ERROR,
  TRANSFER_FORBIDDEN_ERROR,
  TRANSFER_INVALID_RECIPIENT_ERROR,
  TRANSFER_NOT_FOUND_ERROR,
  TRANSFER_NOT_PENDING_ERROR,
  TRANSFER_PROJECT_DELETING_ERROR,
  type OwnershipTransferError,
} from "../../application/usecases/ownership-transfer";
import { ControlPlaneOwnershipTransferProvider } from "../../infrastructure/entitlements/control-plane-ownership-transfer-provider";
import { D1ProjectOwnershipTransferRepository } from "../../infrastructure/db/repositories/d1-project-ownership-transfer-repository";
import type { ProjectDeletionNotificationGateway } from "../../application/ports/project-deletion-notification-gateway";
import { ControlPlaneProjectDeletionNotificationGateway } from "../../infrastructure/entitlements/control-plane-project-deletion-notification-gateway";
import { D1ProjectDeletionRequestRepository } from "../../infrastructure/db/repositories/d1-project-deletion-request-repository";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
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
export const createProjectDeletionNotificationGateway = (
  bindings: Bindings,
): ProjectDeletionNotificationGateway | undefined => {
  if (bindings.ENTITLEMENT_MODE !== "control-plane") return undefined;
  if (!bindings.CONTROL_PLANE) {
    throw new Error(
      "CONTROL_PLANE binding is required in control-plane entitlement mode",
    );
  }
  return new ControlPlaneProjectDeletionNotificationGateway(
    bindings.CONTROL_PLANE,
  );
};

/** セルフホストは課金 RPC を呼ばないため undefined。 */
export const createProjectDeletionNotifications = (bindings: Bindings) => {
  const gateway = createProjectDeletionNotificationGateway(bindings);
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

export const isTransferCheckoutEnabled = (bindings: Bindings): boolean =>
  isCheckoutEnabled(bindings) && bindings.TRANSFER_CHECKOUT_ENABLED === "true";

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

billingRoute.get("/billing/operations", async (c) => {
  if (c.env.ENTITLEMENT_MODE !== "control-plane" || !c.env.CONTROL_PLANE) {
    return c.json({ error: "Operations are not available" }, 409);
  }
  const result = await listOwnedProjectUsage(
    {
      projects: new D1ProjectRepository(c.env.DB),
      operations: new ControlPlaneOperationsGateway(c.env.CONTROL_PLANE),
      accessState: (projectId) => getProjectAccessState(c.env, projectId),
    },
    {
      userId: c.get("currentUser").id,
      locale: c.req.query("locale") === "en" ? "en" : "ja",
      checkoutEnabled: isCheckoutEnabled(c.env),
    },
  );
  if (result.isErr()) {
    return c.json({ error: "Failed to load projects" }, 500);
  }
  return c.json(result.value);
});

billingRoute.post("/billing/account-operations/manage", async (c) => {
  if (c.env.ENTITLEMENT_MODE !== "control-plane" || !c.env.CONTROL_PLANE) {
    return c.json({ error: "Operations are not available" }, 409);
  }
  const origin = new URL(c.req.url).origin;

  try {
    const session = await new ControlPlaneOperationsGateway(
      c.env.CONTROL_PLANE,
    ).startAccountOperation({
      accountId: c.get("currentUser").id,
      operation: "manage",
      returnUrl: `${origin}/account?operation=manage`,
    });
    return c.json({ url: session.url }, 201);
  } catch (error) {
    console.error("Failed to start account operation", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return c.json({ error: "The operation is temporarily unavailable" }, 503);
  }
});

// /projects/:projectId 配下に置くと閲覧のみの書き込みゲートに止められるため、別パスにする。
billingRoute.post(
  "/billing/projects/:projectId/operations/:operation",
  async (c) => {
    if (c.env.ENTITLEMENT_MODE !== "control-plane" || !c.env.CONTROL_PLANE) {
      return c.json({ error: "Operations are not available" }, 409);
    }
    const operation = c.req.param("operation");
    if (!isProjectOperation(operation)) {
      return c.json({ error: "Unknown operation" }, 404);
    }
    const projectId = c.req.param("projectId");
    const origin = new URL(c.req.url).origin;
    const projectUrl = `${origin}/projects/${encodeURIComponent(projectId)}`;
    const returnBase =
      c.req.query("from") === "settings"
        ? `${projectUrl}/settings`
        : `${origin}/account`;

    const result = await startProjectOperation(
      {
        projects: new D1ProjectRepository(c.env.DB),
        deletions: new D1ProjectDeletionRequestRepository(c.env.DB),
        operations: new ControlPlaneOperationsGateway(c.env.CONTROL_PLANE),
      },
      {
        userId: c.get("currentUser").id,
        projectId,
        operation,
        now: new Date(),
        returnUrl: `${returnBase}?operation=${operation}`,
        successUrl: `${projectUrl}?operation=resume`,
        cancelUrl: `${projectUrl}?operation=resume-cancel`,
      },
      isCheckoutEnabled(c.env),
    );

    if (result.isOk()) return c.json({ url: result.value.url }, 201);
    switch (result.error) {
      case OPERATION_NOT_FOUND_ERROR:
        return c.json({ error: "Project not found" }, 404);
      case OPERATION_FORBIDDEN_ERROR:
        return c.json({ error: "Only the owner can do this" }, 403);
      case OPERATION_NOT_OFFERED_ERROR:
        return c.json(
          {
            error: "The operation is not available",
            code: "operation_not_offered",
          },
          409,
        );
      case OPERATION_PROJECT_DELETING_ERROR:
        return c.json(
          { error: "Project is being deleted", code: "project_deleting" },
          409,
        );
      default:
        console.error("Failed to start project operation", {
          operation,
          reason: result.error,
        });
        return c.json(
          { error: "The operation is temporarily unavailable" },
          503,
        );
    }
  },
);

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
    case TRANSFER_PROJECT_DELETING_ERROR:
      return {
        body: { error: "Project is being deleted", code: "project_deleting" },
        status: 409 as const,
      };
    case TRANSFER_CHECKOUT_DISABLED_ERROR:
      return {
        body: {
          error: "Checkout is not available",
          code: "checkout_disabled",
        },
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

export const createTransferServices = (bindings: Bindings) =>
  bindings.ENTITLEMENT_MODE === "control-plane" && bindings.CONTROL_PLANE
    ? {
        provider: new ControlPlaneOwnershipTransferProvider(
          bindings.CONTROL_PLANE,
        ),
        deletions: new D1ProjectDeletionRequestRepository(bindings.DB),
      }
    : undefined;

const transferDeps = (bindings: Bindings) => ({
  projects: new D1ProjectRepository(bindings.DB),
  transfers: new D1ProjectOwnershipTransferRepository(bindings.DB),
});

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
    const services = createTransferServices(c.env);
    if (!services)
      return c.json({ error: "Operations are not available" }, 409);
    const result = await getOwnershipTransfer(
      {
        ...transferDeps(c.env),
        ...services,
        acquisitionAvailable: isTransferCheckoutEnabled(c.env),
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
        ...transferDeps(c.env),
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

billingRoute.post(
  "/billing/projects/:projectId/ownership-transfer/checkout",
  async (c) => {
    const controlPlane = c.env.CONTROL_PLANE;
    if (!controlPlane)
      return c.json({ error: "Billing is not available" }, 409);
    const body = (await c.req.json().catch(() => null)) as {
      transferId?: unknown;
    } | null;
    if (
      !body ||
      typeof body.transferId !== "string" ||
      body.transferId === ""
    ) {
      return c.json({ error: "transferId is required" }, 400);
    }
    const projectId = c.req.param("projectId");
    const base = `${new URL(c.req.url).origin}/projects/${encodeURIComponent(projectId)}/settings`;
    const projects = new D1ProjectRepository(c.env.DB);
    const result = await startTransferCheckout(
      {
        ...transferDeps(c.env),
        projects,
        projectNames: projects,
        deletions: new D1ProjectDeletionRequestRepository(c.env.DB),
        clock: () => new Date(),
        provider: new ControlPlaneOwnershipTransferProvider(controlPlane),
      },
      {
        userId: c.get("currentUser").id,
        projectId,
        transferId: body.transferId,
        now: new Date(),
        successUrl: `${base}?billing=transfer`,
        cancelUrl: `${base}?billing=transfer-cancel`,
      },
      isTransferCheckoutEnabled(c.env),
    );
    if (result.isErr()) {
      const response = ownershipTransferErrorResponse(result.error);
      return c.json(response.body, response.status);
    }
    return c.json({ url: result.value.url }, 201);
  },
);

for (const [path, as] of [
  ["cancel", "requester"],
  ["decline", "recipient"],
] as const) {
  billingRoute.post(
    `/billing/projects/:projectId/ownership-transfer/${path}`,
    async (c) => {
      const body = (await c.req.json().catch(() => null)) as {
        transferId?: unknown;
      } | null;
      if (
        !body ||
        typeof body.transferId !== "string" ||
        body.transferId === ""
      ) {
        return c.json({ error: "transferId is required" }, 400);
      }
      const result = await closeOwnershipTransfer(
        {
          ...transferDeps(c.env),
        },
        {
          userId: c.get("currentUser").id,
          projectId: c.req.param("projectId"),
          transferId: body.transferId,
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
