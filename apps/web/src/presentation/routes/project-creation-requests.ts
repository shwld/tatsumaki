import { Hono } from "hono";
import { INVALID_PROJECT_NAME_ERROR } from "../../application/usecases/create-project";
import {
  completeProjectCreation,
  PROJECT_CREATION_CHECKOUT_UNAVAILABLE_ERROR,
  PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR,
  PROJECT_CREATION_REQUEST_NOT_FOUND_ERROR,
  startProjectCreation,
} from "../../application/usecases/project-creation-request";
import { D1ProjectCreationRequestRepository } from "../../infrastructure/db/repositories/d1-project-creation-request-repository";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
import { ControlPlaneCreationAcquisition } from "../../infrastructure/entitlements/control-plane-creation-acquisition";
import { isCheckoutEnabled } from "./billing";
import { ControlPlaneCreationEligibility } from "../../infrastructure/entitlements/control-plane-creation-eligibility";
import type { Env } from "../../index";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export const projectCreationRequestsRoute = new Hono<Env>();

projectCreationRequestsRoute.post("/project-creation-requests", async (c) => {
  if (!isCheckoutEnabled(c.env) || !c.env.CONTROL_PLANE) {
    return c.json({ error: "Creation is not available" }, 409);
  }

  let body: { name?: unknown; idempotencyKey?: unknown };
  try {
    body = await c.req.json<{ name?: unknown; idempotencyKey?: unknown }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (typeof body.name !== "string") {
    return c.json({ error: "Project name is required" }, 400);
  }
  if (
    typeof body.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY_PATTERN.test(body.idempotencyKey)
  ) {
    return c.json({ error: "idempotencyKey is invalid" }, 400);
  }

  const origin = new URL(c.req.url).origin;
  const result = await startProjectCreation(
    {
      requests: new D1ProjectCreationRequestRepository(c.env.DB),
      eligibility: new ControlPlaneCreationEligibility(c.env.CONTROL_PLANE),
      acquisition: new ControlPlaneCreationAcquisition(c.env.CONTROL_PLANE),
    },
    {
      userId: c.get("currentUser").id,
      name: body.name,
      idempotencyKey: body.idempotencyKey,
      successUrl: (projectId) =>
        `${origin}/projects/new/complete?request=${encodeURIComponent(projectId)}`,
      cancelUrl: `${origin}/projects/new?checkout=cancel`,
    },
  );

  if (result.isOk()) {
    return c.json(result.value, 201);
  }
  switch (result.error) {
    case INVALID_PROJECT_NAME_ERROR:
      return c.json({ error: "Project name is required" }, 400);
    case PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR:
    case PROJECT_CREATION_CHECKOUT_UNAVAILABLE_ERROR:
      console.error("Project creation checkout unavailable", {
        reason: result.error,
      });
      return c.json({ error: "Checkout is temporarily unavailable" }, 503);
    default:
      return c.json({ error: "Failed to start project creation" }, 500);
  }
});

projectCreationRequestsRoute.post(
  "/project-creation-requests/:projectId/complete",
  async (c) => {
    if (c.env.ENTITLEMENT_MODE !== "control-plane" || !c.env.CONTROL_PLANE) {
      return c.json({ error: "Creation is not available" }, 409);
    }
    const result = await completeProjectCreation(
      {
        requests: new D1ProjectCreationRequestRepository(c.env.DB),
        projects: new D1ProjectRepository(c.env.DB),
        eligibility: new ControlPlaneCreationEligibility(c.env.CONTROL_PLANE),
      },
      {
        userId: c.get("currentUser").id,
        projectId: c.req.param("projectId"),
      },
    );

    if (result.isOk()) {
      if (result.value.status === "created") {
        return c.json({ status: "created", project: result.value.project });
      }
      if (result.value.status === "denied") {
        return c.json({ status: "denied" }, 409);
      }
      return c.json({ status: "pending" }, 202);
    }
    switch (result.error) {
      case PROJECT_CREATION_REQUEST_NOT_FOUND_ERROR:
        return c.json({ error: "Project creation request not found" }, 404);
      case PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR:
        return c.json({ error: "Entitlement is temporarily unavailable" }, 503);
      default:
        return c.json({ error: "Failed to create project" }, 500);
    }
  },
);
