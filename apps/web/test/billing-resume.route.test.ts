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
  state?: "active" | "grace" | "suspended";
  subscriptionStatus?: string | null;
  entitlementFails?: boolean;
  checkoutFails?: boolean;
  checkoutEnabled?: boolean;
  omitBilling?: boolean;
};

const setup = (options: Options = {}) => {
  const createCheckoutSession = vi.fn(async (_input: { requestId: string }) => {
    if (options.checkoutFails) throw new Error("cp down");
    return { url: "https://checkout.stripe.com/c/pay/test" };
  });
  const getProjectEntitlement = vi.fn(async ({ projectId }) => {
    if (options.entitlementFails) throw new Error("cp down");
    return {
      projectId,
      state: options.state ?? "suspended",
      validUntil: null,
      revision: 1,
      cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
    };
  });
  const listProjectBilling = vi.fn(
    async ({ projectIds }: { projectIds: string[] }) => ({
      projects: (options.omitBilling ? [] : projectIds).map((projectId) => ({
        projectId,
        entitlementState: options.state ?? "suspended",
        subscription:
          options.subscriptionStatus == null
            ? null
            : {
                status: options.subscriptionStatus,
                endsAt: null,
                nextBilling: { status: "none" as const },
              },
      })),
    }),
  );
  const bindings = {
    DB: env.DB,
    ENTITLEMENT_MODE: "control-plane",
    CHECKOUT_ENABLED: options.checkoutEnabled === false ? "false" : "true",
    CONTROL_PLANE: {
      getProjectEntitlement,
      createCheckoutSession,
      createPortalSession: vi.fn(),
      listProjectBilling,
    },
  } as unknown as Bindings;
  const resume = (userId: string, projectId: string) =>
    buildApp(userId).request(
      `https://tatsumaki.example/billing/projects/${projectId}/resume`,
      { method: "POST" },
      bindings,
    );
  return { resume, createCheckoutSession };
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

describe("billing resume route", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("starts a checkout for the same project id with return URLs back to it", async () => {
    const projectId = await createProject("owner");
    const { resume, createCheckoutSession } = setup({
      subscriptionStatus: "canceled",
    });

    const response = await resume("owner", projectId);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      url: "https://checkout.stripe.com/c/pay/test",
    });
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        billingAccountId: "owner",
        projectId,
        successUrl: `https://tatsumaki.example/projects/${projectId}?billing=resume`,
        cancelUrl: `https://tatsumaki.example/projects/${projectId}?billing=resume-cancel`,
      }),
    );
  });

  it("allows a project that never had a subscription", async () => {
    const projectId = await createProject("owner");
    const { resume } = setup({ subscriptionStatus: null });
    expect((await resume("owner", projectId)).status).toBe(201);
  });

  it("uses the same request id for repeated requests so double clicks share one checkout", async () => {
    const projectId = await createProject("owner");
    const { resume, createCheckoutSession } = setup({
      subscriptionStatus: "canceled",
    });
    await Promise.all([resume("owner", projectId), resume("owner", projectId)]);
    const ids = createCheckoutSession.mock.calls.map(
      (call) => call[0].requestId,
    );
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it("rejects non-owner members and hides the project from non-members", async () => {
    const projectId = await createProject("owner");
    await addMember(projectId, "member", "member");
    const { resume, createCheckoutSession } = setup({
      subscriptionStatus: "canceled",
    });

    expect((await resume("member", projectId)).status).toBe(403);
    expect((await resume("stranger", projectId)).status).toBe(404);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it.each([
    "active",
    "grace",
  ] as const)("refuses to buy again while the project is %s", async (state) => {
    const projectId = await createProject("owner");
    const { resume, createCheckoutSession } = setup({
      state,
      subscriptionStatus: "active",
    });
    const response = await resume("owner", projectId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "not_suspended" });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it.each([
    "past_due",
    "unpaid",
    "incomplete",
    "paused",
  ])("guides to payment repair instead of a new checkout for a %s subscription", async (status) => {
    const projectId = await createProject("owner");
    const { resume, createCheckoutSession } = setup({
      subscriptionStatus: status,
    });
    const response = await resume("owner", projectId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "payment_action_required",
    });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("does not start a new subscription when checkout is disabled", async () => {
    const projectId = await createProject("owner");
    const { resume, createCheckoutSession } = setup({
      subscriptionStatus: "canceled",
      checkoutEnabled: false,
    });
    const response = await resume("owner", projectId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "checkout_disabled" });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("still routes payment repair when checkout is disabled", async () => {
    const projectId = await createProject("owner");
    const { resume } = setup({
      subscriptionStatus: "past_due",
      checkoutEnabled: false,
    });
    const response = await resume("owner", projectId);
    expect(await response.json()).toMatchObject({
      code: "payment_action_required",
    });
  });

  it.each([
    ["entitlement", { entitlementFails: true }],
    ["checkout", { checkoutFails: true, subscriptionStatus: "canceled" }],
  ] as const)("returns 503 when the Control Plane %s call fails", async (_, options) => {
    const projectId = await createProject("owner");
    const { resume } = setup(options);
    expect((await resume("owner", projectId)).status).toBe(503);
  });

  it("does not create a checkout when the billing record for the project is missing", async () => {
    const projectId = await createProject("owner");
    const { resume, createCheckoutSession } = setup({ omitBilling: true });
    expect((await resume("owner", projectId)).status).toBe(503);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("is unavailable on self-hosted", async () => {
    const projectId = await createProject("owner");
    const response = await buildApp("owner").request(
      `https://tatsumaki.example/billing/projects/${projectId}/resume`,
      { method: "POST" },
      { DB: env.DB } as unknown as Bindings,
    );
    expect(response.status).toBe(409);
  });
});
