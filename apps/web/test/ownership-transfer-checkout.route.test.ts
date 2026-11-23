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

type Lifecycle = "live" | "ending" | "ended" | null;

const setup = (
  options: {
    subscriptions?: Record<string, Lifecycle>;
    checkoutEnabled?: boolean;
    transferCheckoutEnabled?: boolean;
    expireFails?: boolean;
  } = {},
) => {
  const subscriptions = { owner: "live", ...options.subscriptions } as Record<
    string,
    Lifecycle
  >;
  const listProjectBilling = vi.fn(
    async ({
      billingAccountId,
      projectIds,
    }: {
      billingAccountId: string;
      projectIds: string[];
    }) => ({
      projects: projectIds.map((projectId) => {
        const lifecycle = subscriptions[billingAccountId] ?? null;
        return {
          projectId,
          entitlementState: "active",
          subscription: lifecycle
            ? {
                lifecycle,
                endsAt: null,
                nextBilling: { status: "none" as const },
              }
            : null,
        };
      }),
    }),
  );
  const createCheckoutSession = vi.fn(async (_input: unknown) => ({
    url: "https://checkout.stripe.test/session",
  }));
  const expireTransferCheckout = vi.fn(async (_input: unknown) => {
    if (options.expireFails) throw new Error("stripe down");
    return { expiredSessionCount: 1 };
  });
  const bindings = {
    DB: env.DB,
    ENTITLEMENT_MODE: "control-plane",
    CHECKOUT_ENABLED: options.checkoutEnabled === false ? "false" : "true",
    TRANSFER_CHECKOUT_ENABLED:
      options.transferCheckoutEnabled === false ? "false" : "true",
    CONTROL_PLANE: {
      getProjectEntitlement: vi.fn(),
      listProjectBilling,
      createCheckoutSession,
      expireTransferCheckout,
    },
  } as unknown as Bindings;
  const call = (
    userId: string,
    projectId: string,
    method: "GET" | "POST",
    suffix = "",
    body?: unknown,
  ) =>
    buildApp(userId).request(
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
      bindings,
    );
  return {
    call,
    listProjectBilling,
    createCheckoutSession,
    expireTransferCheckout,
  };
};

const addMember = (projectId: string, userId: string, role: string) =>
  env.DB.prepare(
    "insert into project_members (project_id, user_id, role) values (?, ?, ?)",
  )
    .bind(projectId, userId, role)
    .run();

/** owner が bob へ申請済みのプロジェクトを用意する。 */
const seedTransfer = async (
  call: ReturnType<typeof setup>["call"],
): Promise<{ projectId: string; transferId: string }> => {
  const created = await new D1ProjectRepository(env.DB).create({
    name: "Alpha",
    ownerUserId: "owner",
  });
  if (created.isErr()) throw new Error("seed failed");
  const projectId = created.value.id;
  await addMember(projectId, "bob", "member");
  await addMember(projectId, "carol", "member");
  const response = await call("owner", projectId, "POST", "", {
    toUserId: "bob",
  });
  const { transfer } = (await response.json()) as {
    transfer: { id: string };
  };
  return { projectId, transferId: transfer.id };
};

describe("ownership transfer checkout", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("opens a Checkout for the nominated recipient without touching roles", async () => {
    const { call, createCheckoutSession } = setup();
    const { projectId, transferId } = await seedTransfer(call);

    const response = await call("bob", projectId, "POST", "/checkout", {
      transferId,
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      url: "https://checkout.stripe.test/session",
    });
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        billingAccountId: "bob",
        projectId,
        projectName: "Alpha",
        transferId,
        successUrl: expect.stringContaining("billing=transfer"),
      }),
    );
    const roles = await env.DB.prepare(
      "select user_id, role from project_members where project_id = ? order by user_id",
    )
      .bind(projectId)
      .all<{ user_id: string; role: string }>();
    expect(roles.results).toEqual([
      { user_id: "bob", role: "member" },
      { user_id: "carol", role: "member" },
      { user_id: "owner", role: "owner" },
    ]);
  });

  it("returns the same Checkout request id when the recipient opens it again", async () => {
    const { call, createCheckoutSession } = setup();
    const { projectId, transferId } = await seedTransfer(call);

    await call("bob", projectId, "POST", "/checkout", { transferId });
    await call("bob", projectId, "POST", "/checkout", { transferId });

    const [first, second] = createCheckoutSession.mock.calls.map(
      ([input]) => (input as { requestId: string }).requestId,
    );
    expect(first).toBeDefined();
    expect(first).toBe(second);
  });

  it.each([
    ["the requester", "owner"],
    ["another member", "carol"],
  ])("rejects %s", async (_label, userId) => {
    const { call, createCheckoutSession } = setup();
    const { projectId, transferId } = await seedTransfer(call);

    const response = await call(userId, projectId, "POST", "/checkout", {
      transferId,
    });

    expect(response.status).toBe(403);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects a transfer id that is not the pending request of this project", async () => {
    const { call, createCheckoutSession } = setup();
    const { projectId } = await seedTransfer(call);

    const response = await call("bob", projectId, "POST", "/checkout", {
      transferId: "someone-elses-transfer",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "not_pending" });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects a non-member", async () => {
    const { call, createCheckoutSession } = setup();
    const { projectId, transferId } = await seedTransfer(call);

    const response = await call("mallory", projectId, "POST", "/checkout", {
      transferId,
    });

    expect(response.status).toBe(404);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("does not start a Checkout when the recipient already subscribes", async () => {
    const { call, createCheckoutSession } = setup({
      subscriptions: { bob: "live" },
    });
    const { projectId, transferId } = await seedTransfer(call);

    const response = await call("bob", projectId, "POST", "/checkout", {
      transferId,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "already_subscribed" });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("honours the Checkout stop switch", async () => {
    const { call, createCheckoutSession } = setup({ checkoutEnabled: false });
    const { projectId, transferId } = await seedTransfer(call);

    const response = await call("bob", projectId, "POST", "/checkout", {
      transferId,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "checkout_disabled" });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("does not open a Checkout for a project whose deletion was requested", async () => {
    const { call, createCheckoutSession } = setup();
    const { projectId, transferId } = await seedTransfer(call);
    await env.DB.prepare(
      "insert into project_deletion_requests (project_id, requested_by_user_id) values (?, ?)",
    )
      .bind(projectId, "owner")
      .run();

    const response = await call("bob", projectId, "POST", "/checkout", {
      transferId,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "project_deleting" });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("keeps the transfer Checkout closed until its own switch is on", async () => {
    const { call, createCheckoutSession } = setup({
      transferCheckoutEnabled: false,
    });
    const { projectId, transferId } = await seedTransfer(call);

    const response = await call("bob", projectId, "POST", "/checkout", {
      transferId,
    });
    const view = await call("bob", projectId, "GET");

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "checkout_disabled" });
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(
      ((await view.json()) as { transfer: Record<string, unknown> }).transfer
        .checkoutAvailable,
    ).toBe(false);
  });

  it("refuses to start once the request has been cancelled", async () => {
    const { call, createCheckoutSession } = setup();
    const { projectId, transferId } = await seedTransfer(call);
    await call("owner", projectId, "POST", "/cancel", { transferId });

    const response = await call("bob", projectId, "POST", "/checkout", {
      transferId,
    });

    expect(response.status).toBe(409);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("refuses to start after the request expired", async () => {
    const { call, createCheckoutSession } = setup();
    const { projectId, transferId } = await seedTransfer(call);
    await env.DB.prepare(
      "update project_ownership_transfers set expires_at = ? where id = ?",
    )
      .bind(new Date(Date.now() - 1000).toISOString(), transferId)
      .run();

    const response = await call("bob", projectId, "POST", "/checkout", {
      transferId,
    });

    expect(response.status).toBe(409);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it.each([
    ["cancelled by the requester", "owner", "/cancel"],
    ["declined by the recipient", "bob", "/decline"],
  ])("expires the recipient's open Checkout when the request is %s", async (_label, userId, path) => {
    const { call, expireTransferCheckout } = setup();
    const { projectId, transferId } = await seedTransfer(call);

    const response = await call(userId, projectId, "POST", path, {
      transferId,
    });

    expect(response.status).toBe(200);
    expect(expireTransferCheckout).toHaveBeenCalledWith({
      billingAccountId: "bob",
      projectId,
      transferId,
    });
  });

  it.each([
    ["cancel", "owner"],
    ["decline", "bob"],
  ])("refuses to %s once the recipient's subscription is confirmed", async (path, userId) => {
    const { call, expireTransferCheckout } = setup({
      subscriptions: { bob: "live" },
    });
    const { projectId, transferId } = await seedTransfer(call);

    const response = await call(userId, projectId, "POST", `/${path}`, {
      transferId,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "payment_confirmed" });
    expect(expireTransferCheckout).not.toHaveBeenCalled();
    const view = await call("owner", projectId, "GET");
    expect(await view.json()).toMatchObject({ transfer: { id: transferId } });
  });

  it("keeps the request closed even if expiring the Checkout fails", async () => {
    const { call } = setup({ expireFails: true });
    const { projectId, transferId } = await seedTransfer(call);

    const response = await call("bob", projectId, "POST", "/decline", {
      transferId,
    });

    expect(response.status).toBe(200);
    const view = await call("owner", projectId, "GET");
    expect(await view.json()).toEqual({ transfer: null });
  });

  it("tells the recipient, not the requester, whether their own subscription is live", async () => {
    const { call } = setup({ subscriptions: { bob: "live" } });
    const { projectId } = await seedTransfer(call);

    const recipient = await call("bob", projectId, "GET");
    const requester = await call("owner", projectId, "GET");

    expect(
      ((await recipient.json()) as { transfer: Record<string, unknown> })
        .transfer.recipientSubscribed,
    ).toBe(true);
    expect(
      ((await requester.json()) as { transfer: Record<string, unknown> })
        .transfer,
    ).not.toHaveProperty("recipientSubscribed");
  });

  it("does not mistake the current owner's live subscription for the recipient's", async () => {
    const { call } = setup();
    const { projectId } = await seedTransfer(call);

    const recipient = await call("bob", projectId, "GET");

    expect(
      ((await recipient.json()) as { transfer: Record<string, unknown> })
        .transfer.recipientSubscribed,
    ).toBe(false);
  });
});
