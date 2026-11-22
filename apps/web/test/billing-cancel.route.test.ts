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
  endsAt?: string | null;
  cancelFails?: boolean;
  listFails?: boolean;
  omitBilling?: boolean;
  checkoutEnabled?: boolean;
};

const setup = (options: Options = {}) => {
  const createSubscriptionCancelSession = vi.fn(
    async (_input: {
      billingAccountId: string;
      projectId: string;
      returnUrl: string;
    }) => {
      if (options.cancelFails) throw new Error("cp down");
      return { url: "https://billing.stripe.com/p/session/cancel" };
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
                  endsAt: options.endsAt ?? null,
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
      createSubscriptionCancelSession,
      listProjectBilling,
    },
  } as unknown as Bindings;
  const cancel = (
    userId: string,
    projectId: string,
    body?: unknown,
    query = "",
  ) =>
    buildApp(userId).request(
      `https://tatsumaki.example/billing/projects/${projectId}/cancel${query}`,
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
  return { cancel, createSubscriptionCancelSession };
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

describe("billing cancel route", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("opens the confirmation for only the selected project and returns to /account", async () => {
    const first = await createProject("owner");
    await createProject("owner");
    const { cancel, createSubscriptionCancelSession } = setup();

    const response = await cancel("owner", first);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      url: "https://billing.stripe.com/p/session/cancel",
    });
    expect(createSubscriptionCancelSession).toHaveBeenCalledTimes(1);
    expect(createSubscriptionCancelSession).toHaveBeenCalledWith({
      billingAccountId: "owner",
      projectId: first,
      returnUrl: "https://tatsumaki.example/account?billing=cancel",
    });
  });

  it("returns to Project Settings when started from there", async () => {
    const projectId = await createProject("owner");
    const { cancel, createSubscriptionCancelSession } = setup();
    const response = await cancel(
      "owner",
      projectId,
      undefined,
      "?from=settings",
    );
    expect(response.status).toBe(201);
    expect(createSubscriptionCancelSession.mock.calls[0]?.[0]).toMatchObject({
      projectId,
      returnUrl: `https://tatsumaki.example/projects/${projectId}/settings?billing=cancel`,
    });
  });

  it("ignores Stripe ids supplied by the client", async () => {
    const projectId = await createProject("owner");
    const { cancel, createSubscriptionCancelSession } = setup();
    await cancel("owner", projectId, {
      subscriptionId: "sub_other",
      customerId: "cus_other",
    });
    expect(createSubscriptionCancelSession.mock.calls[0]?.[0]).toEqual({
      billingAccountId: "owner",
      projectId,
      returnUrl: "https://tatsumaki.example/account?billing=cancel",
    });
  });

  it("rejects non-owner members and hides the project from non-members", async () => {
    const projectId = await createProject("owner");
    await addMember(projectId, "member", "member");
    const { cancel, createSubscriptionCancelSession } = setup();

    expect((await cancel("member", projectId)).status).toBe(403);
    expect((await cancel("stranger", projectId)).status).toBe(404);
    expect(createSubscriptionCancelSession).not.toHaveBeenCalled();
  });

  it.each([
    null,
    "canceled",
    "incomplete_expired",
  ])("refuses when there is no live subscription (%s)", async (status) => {
    const projectId = await createProject("owner");
    const { cancel, createSubscriptionCancelSession } = setup({
      subscriptionStatus: status,
    });
    const response = await cancel("owner", projectId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "no_subscription" });
    expect(createSubscriptionCancelSession).not.toHaveBeenCalled();
  });

  it("refuses to schedule a cancellation twice", async () => {
    const projectId = await createProject("owner");
    const { cancel, createSubscriptionCancelSession } = setup({
      endsAt: "2026-12-25T12:00:00.000Z",
    });
    const response = await cancel("owner", projectId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "already_scheduled" });
    expect(createSubscriptionCancelSession).not.toHaveBeenCalled();
  });

  it("still allows canceling an existing contract while checkout is disabled", async () => {
    const projectId = await createProject("owner");
    const { cancel } = setup({ checkoutEnabled: false });
    expect((await cancel("owner", projectId)).status).toBe(201);
  });

  it.each([
    ["billing lookup", { listFails: true }],
    ["session creation", { cancelFails: true }],
    ["missing billing record", { omitBilling: true }],
  ] as const)("returns 503 and no URL when the %s fails", async (_, options) => {
    const projectId = await createProject("owner");
    const { cancel } = setup(options);
    const response = await cancel("owner", projectId);
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("url");
  });

  it("is unavailable on self-hosted", async () => {
    const projectId = await createProject("owner");
    const response = await buildApp("owner").request(
      `https://tatsumaki.example/billing/projects/${projectId}/cancel`,
      { method: "POST" },
      { DB: env.DB } as unknown as Bindings,
    );
    expect(response.status).toBe(409);
  });
});
