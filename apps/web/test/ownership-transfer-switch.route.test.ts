import { env } from "cloudflare:test";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import type { Bindings, Env } from "../src/index";
import type { CurrentUser } from "../src/presentation/middleware/access-auth";
import { billingRoute } from "../src/presentation/routes/billing";
import { recoverOwnershipTransfersScheduled } from "../src/presentation/scheduled/recover-ownership-transfers";
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

type Payment = {
  recipientSubscribed: boolean;
  previousSubscriptionLive: boolean;
};
type Settlement = {
  status: "settled" | "review" | "pending";
  reviewReason: string | null;
};

const setup = () => {
  const state = {
    payment: {
      recipientSubscribed: false,
      previousSubscriptionLive: true,
    } as Payment,
    settlement: { status: "settled", reviewReason: null } as Settlement,
    confirmFails: false,
    settleFails: false,
  };
  const confirmTransferPayment = vi.fn(async (_input: unknown) => {
    if (state.confirmFails) throw new Error("cp down");
    return state.payment;
  });
  const settleOwnershipTransfer = vi.fn(async (_input: unknown) => {
    if (state.settleFails) throw new Error("cp down");
    return { ...state.settlement, canceledSubscriptionCount: 1 };
  });
  const bindings = {
    DB: env.DB,
    ENTITLEMENT_MODE: "control-plane",
    CONTROL_PLANE: {
      getProjectEntitlement: vi.fn(),
      listProjectBilling: vi.fn(
        async ({
          billingAccountId,
          projectIds,
        }: {
          billingAccountId: string;
          projectIds: string[];
        }) => ({
          projects: projectIds.map((projectId) => ({
            projectId,
            entitlementState: "active",
            subscription:
              billingAccountId === "owner"
                ? {
                    lifecycle: "live",
                    endsAt: null,
                    nextBilling: { status: "none" },
                  }
                : null,
          })),
        }),
      ),
      expireTransferCheckout: vi.fn(async () => ({ expiredSessionCount: 0 })),
      confirmTransferPayment,
      settleOwnershipTransfer,
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
    state,
    bindings,
    call,
    confirmTransferPayment,
    settleOwnershipTransfer,
  };
};

const addMember = (projectId: string, userId: string, role: string) =>
  env.DB.prepare(
    "insert into project_members (project_id, user_id, role) values (?, ?, ?)",
  )
    .bind(projectId, userId, role)
    .run();

const seedTransfer = async (call: ReturnType<typeof setup>["call"]) => {
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
  const { transfer } = (await response.json()) as { transfer: { id: string } };
  return { projectId, transferId: transfer.id };
};

const roleOf = async (projectId: string, userId: string) =>
  (
    await env.DB.prepare(
      "select role from project_members where project_id = ? and user_id = ?",
    )
      .bind(projectId, userId)
      .first<{ role: string }>()
  )?.role;

const transferRow = (transferId: string) =>
  env.DB.prepare(
    "select status, settlement_outcome as outcome, settlement_status as settlement, settlement_note as note from project_ownership_transfers where id = ?",
  )
    .bind(transferId)
    .first<{
      status: string;
      outcome: string | null;
      settlement: string | null;
      note: string | null;
    }>();

type View = { state: string; role: string } | null;
const viewOf = async (response: Response): Promise<View> =>
  ((await response.json()) as { transfer: View }).transfer;

describe("ownership transfer switch", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  describe("when the recipient's subscription is paid", () => {
    it("makes the recipient owner and the requester a member, then settles the previous subscription", async () => {
      const { call, state, settleOwnershipTransfer } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      state.payment.recipientSubscribed = true;

      const view = await viewOf(await call("bob", projectId, "GET"));

      expect(view).toMatchObject({ state: "completed", role: "recipient" });
      expect(await roleOf(projectId, "bob")).toBe("owner");
      expect(await roleOf(projectId, "owner")).toBe("member");
      expect(await roleOf(projectId, "carol")).toBe("member");
      expect(await transferRow(transferId)).toMatchObject({
        status: "completed",
        outcome: "switched",
        settlement: "settled",
      });
      expect(settleOwnershipTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          transferId,
          outcome: "switched",
          fromBillingAccountId: "owner",
          toBillingAccountId: "bob",
          switchedAt: expect.any(String),
        }),
      );
    });

    it("shows both parties the completed transfer, and the former owner no longer owns", async () => {
      const { call, state } = setup();
      const { projectId } = await seedTransfer(call);
      state.payment.recipientSubscribed = true;
      await call("bob", projectId, "GET");

      expect(await viewOf(await call("owner", projectId, "GET"))).toMatchObject(
        {
          state: "completed",
          role: "requester",
        },
      );
      expect(await viewOf(await call("carol", projectId, "GET"))).toBeNull();
    });

    it("keeps the other owners' permissions", async () => {
      const { call, state } = setup();
      const { projectId } = await seedTransfer(call);
      await env.DB.prepare(
        "update project_members set role = 'owner' where project_id = ? and user_id = ?",
      )
        .bind(projectId, "carol")
        .run();
      state.payment.recipientSubscribed = true;
      await call("bob", projectId, "GET");
      expect(await roleOf(projectId, "carol")).toBe("owner");
    });

    it("stays processing and retries the settlement when the Control Plane fails", async () => {
      const { call, state, settleOwnershipTransfer } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      state.payment.recipientSubscribed = true;
      state.settleFails = true;

      expect(await viewOf(await call("bob", projectId, "GET"))).toMatchObject({
        state: "processing",
      });
      expect(await roleOf(projectId, "bob")).toBe("owner");
      expect(await transferRow(transferId)).toMatchObject({
        settlement: "pending",
      });

      state.settleFails = false;
      expect(await viewOf(await call("owner", projectId, "GET"))).toMatchObject(
        {
          state: "completed",
        },
      );
      expect(settleOwnershipTransfer).toHaveBeenCalledTimes(2);
    });

    it("asks for review, not completion, when a refund cannot be made automatically", async () => {
      const { call, state } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      state.payment.recipientSubscribed = true;
      state.settlement = {
        status: "review",
        reviewReason: "refund_rejected:x",
      };

      expect(await viewOf(await call("owner", projectId, "GET"))).toMatchObject(
        {
          state: "review",
        },
      );
      expect(await transferRow(transferId)).toMatchObject({
        settlement: "review",
        note: "refund_rejected:x",
      });
    });

    it("stays processing while a refund is in flight, and settles once Stripe finishes it", async () => {
      const { call, state, settleOwnershipTransfer } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      state.payment.recipientSubscribed = true;
      state.settlement = { status: "pending", reviewReason: null };

      expect(await viewOf(await call("owner", projectId, "GET"))).toMatchObject(
        {
          state: "processing",
        },
      );
      expect((await transferRow(transferId))?.settlement).toBe("pending");

      state.settlement = { status: "settled", reviewReason: null };
      expect(await viewOf(await call("owner", projectId, "GET"))).toMatchObject(
        {
          state: "completed",
        },
      );
      expect(settleOwnershipTransfer).toHaveBeenCalledTimes(2);
    });

    it("does not switch twice when the transfer is read again", async () => {
      const { call, state, settleOwnershipTransfer } = setup();
      const { projectId } = await seedTransfer(call);
      state.payment.recipientSubscribed = true;
      await call("bob", projectId, "GET");
      await call("bob", projectId, "GET");
      await call("owner", projectId, "GET");
      expect(settleOwnershipTransfer).toHaveBeenCalledTimes(1);
      expect(await roleOf(projectId, "bob")).toBe("owner");
    });
  });

  describe("when the transfer cannot be confirmed", () => {
    it("does not change roles before the recipient's payment is confirmed", async () => {
      const { call, settleOwnershipTransfer } = setup();
      const { projectId } = await seedTransfer(call);
      expect(await viewOf(await call("bob", projectId, "GET"))).toMatchObject({
        state: "pending",
      });
      expect(await roleOf(projectId, "owner")).toBe("owner");
      expect(await roleOf(projectId, "bob")).toBe("member");
      expect(settleOwnershipTransfer).not.toHaveBeenCalled();
    });

    it("keeps the roles and the transfer pending when payment cannot be checked", async () => {
      const { call, state, settleOwnershipTransfer } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      state.confirmFails = true;
      expect(await viewOf(await call("bob", projectId, "GET"))).toMatchObject({
        state: "pending",
      });
      expect(await roleOf(projectId, "owner")).toBe("owner");
      expect((await transferRow(transferId))?.status).toBe("pending");
      expect(settleOwnershipTransfer).not.toHaveBeenCalled();
    });

    it("refunds the recipient in full when the previous subscription was lost before the switch", async () => {
      const { call, state, settleOwnershipTransfer } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      state.payment = {
        recipientSubscribed: true,
        previousSubscriptionLive: false,
      };

      expect(await viewOf(await call("bob", projectId, "GET"))).toBeNull();
      expect(await roleOf(projectId, "owner")).toBe("owner");
      expect(await roleOf(projectId, "bob")).toBe("member");
      expect(await transferRow(transferId)).toMatchObject({
        status: "cancelled",
        outcome: "not-switched",
      });
      expect(settleOwnershipTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ transferId, outcome: "not-switched" }),
      );
    });

    it("refunds the recipient and keeps the owner when the requester lost ownership first", async () => {
      const { call, state, settleOwnershipTransfer } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      await env.DB.prepare(
        "update project_members set role = 'owner' where project_id = ? and user_id = ?",
      )
        .bind(projectId, "carol")
        .run();
      await env.DB.prepare(
        "update project_members set role = 'member' where project_id = ? and user_id = ?",
      )
        .bind(projectId, "owner")
        .run();
      state.payment.recipientSubscribed = true;

      await call("bob", projectId, "GET");

      expect(await roleOf(projectId, "bob")).toBe("member");
      expect(await roleOf(projectId, "carol")).toBe("owner");
      expect((await transferRow(transferId))?.status).toBe("cancelled");
      expect(settleOwnershipTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "not-switched" }),
      );
    });

    it("refunds the recipient instead of switching a project that is being deleted", async () => {
      const { call, state, settleOwnershipTransfer } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      await env.DB.prepare(
        "insert into project_deletion_requests (project_id, requested_by_user_id) values (?, ?)",
      )
        .bind(projectId, "owner")
        .run();
      state.payment.recipientSubscribed = true;

      await call("bob", projectId, "GET");

      expect(await roleOf(projectId, "owner")).toBe("owner");
      expect((await transferRow(transferId))?.status).toBe("cancelled");
      expect(settleOwnershipTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "not-switched" }),
      );
    });
  });

  describe("a payment that arrives after the transfer ended", () => {
    it("is refunded in full by the recovery job without changing roles", async () => {
      const { call, bindings, settleOwnershipTransfer } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      await call("bob", projectId, "POST", "/decline", { transferId });
      expect((await transferRow(transferId))?.settlement).toBe("pending");

      await recoverOwnershipTransfersScheduled(bindings);

      expect(settleOwnershipTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ transferId, outcome: "not-switched" }),
      );
      expect(await roleOf(projectId, "owner")).toBe("owner");
      expect(await roleOf(projectId, "bob")).toBe("member");
    });

    it("keeps checking until the Checkout window has passed, then stops", async () => {
      const { call, bindings, settleOwnershipTransfer } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      await call("bob", projectId, "POST", "/decline", { transferId });

      await recoverOwnershipTransfersScheduled(bindings);
      expect((await transferRow(transferId))?.settlement).toBe("pending");

      await env.DB.prepare(
        "update project_ownership_transfers set ended_at = ? where id = ?",
      )
        .bind(new Date(Date.now() - 26 * 3_600_000).toISOString(), transferId)
        .run();
      await recoverOwnershipTransfersScheduled(bindings);
      expect((await transferRow(transferId))?.settlement).toBe("settled");

      const calls = settleOwnershipTransfer.mock.calls.length;
      await recoverOwnershipTransfersScheduled(bindings);
      expect(settleOwnershipTransfer).toHaveBeenCalledTimes(calls);
    });

    it("hands a payment that cannot be refunded to the operator and stops retrying", async () => {
      const { call, bindings, state, settleOwnershipTransfer } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      await call("bob", projectId, "POST", "/decline", { transferId });
      state.settlement = {
        status: "review",
        reviewReason: "refund_rejected:x",
      };

      await recoverOwnershipTransfersScheduled(bindings);
      expect(await transferRow(transferId)).toMatchObject({
        settlement: "review",
        note: "refund_rejected:x",
      });
      const calls = settleOwnershipTransfer.mock.calls.length;
      await recoverOwnershipTransfersScheduled(bindings);
      expect(settleOwnershipTransfer).toHaveBeenCalledTimes(calls);
    });

    it("expires an overdue transfer and refunds a payment that arrived after it", async () => {
      const { call, bindings, settleOwnershipTransfer } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      await env.DB.prepare(
        "update project_ownership_transfers set expires_at = ? where id = ?",
      )
        .bind(new Date(Date.now() - 1000).toISOString(), transferId)
        .run();

      await recoverOwnershipTransfersScheduled(bindings);

      expect((await transferRow(transferId))?.status).toBe("expired");
      expect(settleOwnershipTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ transferId, outcome: "not-switched" }),
      );
      expect(await roleOf(projectId, "owner")).toBe("owner");
    });
  });

  describe("a transfer that did not switch but left a refund to review", () => {
    it("tells only the recipient who paid", async () => {
      const { call, bindings, state } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      await call("bob", projectId, "POST", "/decline", { transferId });
      state.settlement = {
        status: "review",
        reviewReason: "refund_rejected:x",
      };
      await recoverOwnershipTransfersScheduled(bindings);

      expect(await viewOf(await call("bob", projectId, "GET"))).toMatchObject({
        state: "review",
        outcome: "not-switched",
        role: "recipient",
      });
      expect(await viewOf(await call("owner", projectId, "GET"))).toBeNull();
    });
  });

  describe("two transfers in a row", () => {
    it("does not switch again until the earlier switch has been settled", async () => {
      const { call, bindings, state, settleOwnershipTransfer } = setup();
      const { projectId } = await seedTransfer(call);
      state.payment.recipientSubscribed = true;
      state.settleFails = true;
      await call("bob", projectId, "GET");
      expect(await roleOf(projectId, "bob")).toBe("owner");

      await env.DB.prepare(
        "insert into project_ownership_transfers (id, project_id, from_user_id, to_user_id, expires_at, created_at) values (?, ?, 'bob', 'carol', ?, ?)",
      )
        .bind(
          "t_second",
          projectId,
          new Date(Date.now() + 86_400_000).toISOString(),
          new Date(Date.now() + 1000).toISOString(),
        )
        .run();
      await call("carol", projectId, "GET");
      expect(await roleOf(projectId, "carol")).toBe("member");
      expect((await transferRow("t_second"))?.status).toBe("pending");

      state.settleFails = false;
      await recoverOwnershipTransfersScheduled(bindings);
      expect(await roleOf(projectId, "carol")).toBe("owner");
      expect(await roleOf(projectId, "bob")).toBe("member");
      expect(settleOwnershipTransfer).toHaveBeenCalled();
    });

    it("keeps the unresolved refund notice visible after a new request is made", async () => {
      const { call, bindings, state } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      await call("bob", projectId, "POST", "/decline", { transferId });
      state.settlement = {
        status: "review",
        reviewReason: "refund_rejected:x",
      };
      await recoverOwnershipTransfersScheduled(bindings);

      const again = await call("owner", projectId, "POST", "", {
        toUserId: "carol",
      });
      expect(again.status).toBe(201);
      expect(await viewOf(await call("bob", projectId, "GET"))).toMatchObject({
        state: "review",
        outcome: "not-switched",
      });
    });
  });

  describe("recovery job", () => {
    it("rotates the batch so a newer transfer is not starved by older ones", async () => {
      const { call, bindings, state, confirmTransferPayment } = setup();
      const first = await seedTransfer(call);
      const second = await seedTransfer(call);
      void first;
      state.payment.recipientSubscribed = false;

      await recoverOwnershipTransfersScheduled(bindings);
      const rows = await env.DB.prepare(
        "select id, updated_at as touched from project_ownership_transfers order by id",
      ).all<{ id: string; touched: string }>();
      expect(rows.results).toHaveLength(2);
      expect(confirmTransferPayment).toHaveBeenCalledTimes(2);
      expect(second.projectId).not.toBe(first.projectId);
    });

    it("keeps an unsettled refund recoverable after the project is deleted", async () => {
      const { call, bindings, state, settleOwnershipTransfer } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      await call("bob", projectId, "POST", "/decline", { transferId });
      await env.DB.prepare("delete from projects where id = ?")
        .bind(projectId)
        .run();

      state.settlement = {
        status: "review",
        reviewReason: "refund_rejected:x",
      };
      await recoverOwnershipTransfersScheduled(bindings);

      expect(await transferRow(transferId)).toMatchObject({
        settlement: "review",
      });
      expect(settleOwnershipTransfer).toHaveBeenCalled();
    });

    it("completes a paid transfer nobody has opened", async () => {
      const { call, bindings, state } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      state.payment.recipientSubscribed = true;

      await recoverOwnershipTransfersScheduled(bindings);

      expect(await roleOf(projectId, "bob")).toBe("owner");
      expect(await transferRow(transferId)).toMatchObject({
        status: "completed",
        settlement: "settled",
      });
    });

    it("finishes a settlement that was interrupted after the switch", async () => {
      const { call, bindings, state, settleOwnershipTransfer } = setup();
      const { projectId, transferId } = await seedTransfer(call);
      state.payment.recipientSubscribed = true;
      state.settleFails = true;
      await call("bob", projectId, "GET");
      expect((await transferRow(transferId))?.settlement).toBe("pending");

      state.settleFails = false;
      await recoverOwnershipTransfersScheduled(bindings);

      expect((await transferRow(transferId))?.settlement).toBe("settled");
      expect(settleOwnershipTransfer).toHaveBeenCalledTimes(2);
    });

    it("does nothing for self-hosted deployments", async () => {
      await expect(
        recoverOwnershipTransfersScheduled({
          DB: env.DB,
        } as unknown as Bindings),
      ).resolves.toBeUndefined();
    });
  });
});
