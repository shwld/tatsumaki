import { env } from "cloudflare:test";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import type { Bindings, Env } from "../src/index";
import type { CurrentUser } from "../src/presentation/middleware/access-auth";
import { billingRoute } from "../src/presentation/routes/billing";
import { resetDatabase } from "./helpers/db";

const buildApp = (userId: string) => {
  const app = new Hono<Env>();
  app.use(async (c, next) => {
    c.set("currentUser", { id: userId } as CurrentUser);
    await next();
  });
  app.route("/", billingRoute);
  return app;
};

type Options = {
  subscriptionStatus?: string | null;
  sessionFails?: boolean;
  listFails?: boolean;
  omitBilling?: boolean;
  checkoutEnabled?: boolean;
};

const setup = (options: Options = {}) => {
  const createPaymentMethodUpdateSession = vi.fn(
    async (_input: { billingAccountId: string; returnUrl: string }) => {
      if (options.sessionFails) throw new Error("cp down");
      return { url: "https://billing.stripe.com/p/session/payment" };
    },
  );
  const listProjectBilling = vi.fn(
    async ({ projectIds }: { projectIds: string[] }) => {
      if (options.listFails) throw new Error("cp down");
      return {
        projects: (options.omitBilling ? [] : projectIds).map((projectId) => ({
          projectId,
          entitlementState: "active",
          subscription:
            options.subscriptionStatus === null
              ? null
              : {
                  status: options.subscriptionStatus ?? "active",
                  endsAt: null,
                  nextBilling: { status: "none" as const },
                },
        })),
      };
    },
  );
  const bindings = {
    DB: env.DB,
    ENTITLEMENT_MODE: "control-plane",
    CHECKOUT_ENABLED: options.checkoutEnabled === false ? "false" : "true",
    CONTROL_PLANE: {
      getProjectEntitlement: vi.fn(),
      createCheckoutSession: vi.fn(),
      createPortalSession: vi.fn(),
      createSubscriptionCancelSession: vi.fn(),
      createPaymentMethodUpdateSession,
      listProjectBilling,
    },
  } as unknown as Bindings;
  const start = (userId: string, projectId: string, body?: unknown) =>
    buildApp(userId).request(
      `https://tatsumaki.example/billing/projects/${projectId}/payment-method`,
      {
        method: "POST",
        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
              headers: { "content-type": "application/json" },
            }),
      },
      bindings,
    );
  return { start, createPaymentMethodUpdateSession };
};

const createProject = async (ownerUserId: string) => {
  const result = await new D1ProjectRepository(env.DB).create({
    name: "P",
    ownerUserId,
  });
  if (result.isErr()) throw new Error("seed failed");
  return result.value.id;
};

const addMember = (projectId: string, userId: string, role: string) =>
  env.DB.prepare(
    "insert into project_members (project_id, user_id, role) values (?, ?, ?)",
  )
    .bind(projectId, userId, role)
    .run();

describe("billing payment-method route", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("opens the payment method update for the owner and returns to Project Settings", async () => {
    const projectId = await createProject("owner");
    const { start, createPaymentMethodUpdateSession } = setup();

    const response = await start("owner", projectId);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      url: "https://billing.stripe.com/p/session/payment",
    });
    expect(createPaymentMethodUpdateSession).toHaveBeenCalledWith({
      billingAccountId: "owner",
      returnUrl: `https://tatsumaki.example/projects/${projectId}/settings?billing=payment-method`,
    });
  });

  it("ignores Stripe ids supplied by the client", async () => {
    const projectId = await createProject("owner");
    const { start, createPaymentMethodUpdateSession } = setup();
    await start("owner", projectId, { customerId: "cus_other" });
    expect(createPaymentMethodUpdateSession.mock.calls[0]?.[0]).toEqual({
      billingAccountId: "owner",
      returnUrl: `https://tatsumaki.example/projects/${projectId}/settings?billing=payment-method`,
    });
  });

  it("rejects non-owner members and hides the project from non-members", async () => {
    const projectId = await createProject("owner");
    await addMember(projectId, "member", "member");
    const { start, createPaymentMethodUpdateSession } = setup();

    expect((await start("member", projectId)).status).toBe(403);
    expect((await start("stranger", projectId)).status).toBe(404);
    expect(createPaymentMethodUpdateSession).not.toHaveBeenCalled();
  });

  it.each([
    null,
    "canceled",
    "incomplete_expired",
  ])("refuses when the project has no live subscription (%s)", async (status) => {
    const projectId = await createProject("owner");
    const { start, createPaymentMethodUpdateSession } = setup({
      subscriptionStatus: status,
    });
    const response = await start("owner", projectId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "no_subscription" });
    expect(createPaymentMethodUpdateSession).not.toHaveBeenCalled();
  });

  it("still works while checkout is disabled", async () => {
    const projectId = await createProject("owner");
    const { start } = setup({ checkoutEnabled: false });
    expect((await start("owner", projectId)).status).toBe(201);
  });

  it.each([
    ["billing lookup", { listFails: true }],
    ["session creation", { sessionFails: true }],
    ["missing billing record", { omitBilling: true }],
  ] as const)("returns 503 and no URL when the %s fails", async (_, options) => {
    const projectId = await createProject("owner");
    const { start } = setup(options);
    const response = await start("owner", projectId);
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("url");
  });

  it("is unavailable on self-hosted", async () => {
    const projectId = await createProject("owner");
    const response = await buildApp("owner").request(
      `https://tatsumaki.example/billing/projects/${projectId}/payment-method`,
      { method: "POST" },
      { DB: env.DB } as unknown as Bindings,
    );
    expect(response.status).toBe(409);
  });
});
