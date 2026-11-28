import { env } from "cloudflare:test";
import { Hono } from "hono";
import { vi } from "vitest";
import { D1ProjectRepository } from "../../src/infrastructure/db/repositories/d1-project-repository";
import type { Bindings, Env } from "../../src/index";
import type { CurrentUser } from "../../src/presentation/middleware/access-auth";
import { billingRoute } from "../../src/presentation/routes/billing";

export function setupTransfer() {
  const state: {
    eligibility: "pending" | "allowed" | "denied";
    unavailable: boolean;
    deliveryUnavailable: boolean;
    onStart?: () => Promise<void>;
  } = {
    eligibility: "pending",
    unavailable: false,
    deliveryUnavailable: false,
  };
  const getOwnershipEligibility = vi.fn(async () => {
    if (state.unavailable) throw new Error("down");
    return { status: state.eligibility };
  });
  const startOwnershipAcquisition = vi.fn(async (_input: unknown) => {
    if (state.unavailable) throw new Error("down");
    await state.onStart?.();
    return { url: "https://checkout.stripe.test/session" };
  });
  const recordOwnershipTransferOutcome = vi.fn(async (_input: unknown) => {
    if (state.deliveryUnavailable) throw new Error("down");
  });
  const bindings = {
    DB: env.DB,
    ENTITLEMENT_MODE: "control-plane",
    CHECKOUT_ENABLED: "true",
    TRANSFER_CHECKOUT_ENABLED: "true",
    CONTROL_PLANE: {
      getOwnershipEligibility,
      startOwnershipAcquisition,
      recordOwnershipTransferOutcome,
    },
  } as unknown as Bindings;
  const call = (
    userId: string,
    projectId: string,
    method: "GET" | "POST",
    suffix = "",
    body?: unknown,
    overrides: Partial<Bindings> = {},
  ) => {
    const app = new Hono<Env>();
    app.use(async (c, next) => {
      c.set("currentUser", { id: userId } as CurrentUser);
      await next();
    });
    app.route("/", billingRoute);
    return app.request(
      `https://tatsumaki.example/billing/projects/${projectId}/ownership-transfer${suffix}`,
      {
        method,
        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
              headers: { "content-type": "application/json" },
            }),
      },
      { ...bindings, ...overrides },
    );
  };
  return {
    state,
    bindings,
    call,
    getOwnershipEligibility,
    startOwnershipAcquisition,
    recordOwnershipTransferOutcome,
  };
}

export async function seedTransfer(
  call: ReturnType<typeof setupTransfer>["call"],
) {
  const project = (
    await new D1ProjectRepository(env.DB).create({
      name: "Alpha",
      ownerUserId: "owner",
    })
  )._unsafeUnwrap();
  await env.DB.prepare(
    "INSERT INTO project_members (project_id, user_id, role) VALUES (?, 'bob', 'member'), (?, 'carol', 'member')",
  )
    .bind(project.id, project.id)
    .run();
  const response = await call("owner", project.id, "POST", "", {
    toUserId: "bob",
  });
  if (response.status !== 201)
    throw new Error(`seed failed: ${response.status}`);
  const { transfer } = (await response.json()) as { transfer: { id: string } };
  return { projectId: project.id, transferId: transfer.id };
}
export async function roleOf(projectId: string, userId: string) {
  const row = await env.DB.prepare(
    "SELECT role FROM project_members WHERE project_id = ? AND user_id = ?",
  )
    .bind(projectId, userId)
    .first<{ role: string }>();
  return row?.role;
}
