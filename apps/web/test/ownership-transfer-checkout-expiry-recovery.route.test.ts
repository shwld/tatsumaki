import { env } from "cloudflare:test";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import { D1UserRepository } from "../src/infrastructure/db/repositories/d1-user-repository";
import worker, { type Bindings, type Env } from "../src/index";
import type { CurrentUser } from "../src/presentation/middleware/access-auth";
import { authRoute } from "../src/presentation/routes/auth";
import { billingRoute } from "../src/presentation/routes/billing";
import { projectsRoute } from "../src/presentation/routes/projects";
import { resetDatabase } from "./helpers/db";

const buildApp = (userId: string) => {
  const app = new Hono<Env>();
  app.use(async (c, next) => {
    c.set("currentUser", { id: userId } as CurrentUser);
    await next();
  });
  app.route("/", billingRoute);
  app.route("/", projectsRoute);
  app.route("/", authRoute);
  return app;
};

/** 申請の終了時に行う受け手の Checkout の即時失効が、毎回失敗する Control Plane を用意する。 */
const setup = () => {
  const expireTransferCheckout = vi.fn(async (_input: unknown) => {
    throw new Error("stripe down");
  });
  const confirmTransferPayment = vi.fn(async (_input: unknown) => ({
    recipientSubscribed: false,
    previousSubscriptionLive: true,
  }));
  const settleOwnershipTransfer = vi.fn(async (_input: unknown) => ({
    status: "settled",
    reviewReason: null,
    canceledSubscriptionCount: 0,
  }));
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
                    nextBilling: { status: "none" as const },
                    transferId: null,
                  }
                : null,
          })),
        }),
      ),
      expireTransferCheckout,
      confirmTransferPayment,
      settleOwnershipTransfer,
    },
  } as unknown as Bindings;
  const request = async (
    userId: string,
    path: string,
    method: string,
    body?: unknown,
  ) => {
    const afterCommitTasks: Promise<unknown>[] = [];
    const executionCtx = {
      waitUntil: (task: Promise<unknown>) => afterCommitTasks.push(task),
      passThroughOnException() {},
    } as unknown as ExecutionContext;
    const response = await buildApp(userId).request(
      `https://tatsumaki.example${path}`,
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
      executionCtx,
    );
    await Promise.all(afterCommitTasks);
    return response;
  };
  return { bindings, request, expireTransferCheckout, settleOwnershipTransfer };
};

type Request = ReturnType<typeof setup>["request"];

/** Worker の毎時の scheduled ハンドラを実行し、登録された処理の完了を待つ。 */
const runHourlyJob = async (bindings: Bindings) => {
  const tasks: Promise<unknown>[] = [];
  await worker.scheduled({} as ScheduledEvent, bindings, {
    waitUntil: (task: Promise<unknown>) => tasks.push(task),
    passThroughOnException() {},
  } as unknown as ExecutionContext);
  await Promise.all(tasks);
};

const addMember = (projectId: string, userId: string, role: string) =>
  env.DB.prepare(
    "insert into project_members (project_id, user_id, role) values (?, ?, ?)",
  )
    .bind(projectId, userId, role)
    .run();

/** owner と co-owner の carol がいるプロジェクトで、owner が bob へ申請済みの状態を用意する。 */
const seedTransfer = async (request: Request) => {
  const created = await new D1ProjectRepository(env.DB).create({
    name: "Alpha",
    ownerUserId: "owner",
  });
  if (created.isErr()) throw new Error("seed failed");
  const projectId = created.value.id;
  await addMember(projectId, "bob", "member");
  await addMember(projectId, "carol", "owner");
  const response = await request(
    "owner",
    `/billing/projects/${projectId}/ownership-transfer`,
    "POST",
    { toUserId: "bob" },
  );
  expect(response.status).toBe(201);
  const { transfer } = (await response.json()) as { transfer: { id: string } };
  return { projectId, transferId: transfer.id };
};

const transferRow = (transferId: string) =>
  env.DB.prepare(
    "select status, settlement_outcome as outcome, settlement_status as settlement from project_ownership_transfers where id = ?",
  )
    .bind(transferId)
    .first<{
      status: string;
      outcome: string | null;
      settlement: string | null;
    }>();

const deleteAccount = async (request: Request, userId: string) => {
  await new D1UserRepository(env.DB).create({
    id: userId,
    displayName: userId,
    email: `${userId}@example.com`,
  });
  return request(userId, "/auth/me", "DELETE", {
    confirmEmail: `${userId}@example.com`,
  });
};

type EndTransfer = (
  request: Request,
  transfer: { projectId: string; transferId: string },
) => Promise<void>;

const expectOk = (response: Response) => expect(response.status).toBe(200);

/** 終了経路ごとに、申請を終わらせる操作、終了後の状態、その場で即時失効を試すか。 */
const endings: [string, EndTransfer, string, boolean][] = [
  [
    "cancelled by the requester",
    async (request, { projectId, transferId }) =>
      expectOk(
        await request(
          "owner",
          `/billing/projects/${projectId}/ownership-transfer/cancel`,
          "POST",
          { transferId },
        ),
      ),
    "cancelled",
    true,
  ],
  [
    "declined by the recipient",
    async (request, { projectId, transferId }) =>
      expectOk(
        await request(
          "bob",
          `/billing/projects/${projectId}/ownership-transfer/decline`,
          "POST",
          { transferId },
        ),
      ),
    "declined",
    true,
  ],
  [
    "voided because the requester was demoted",
    async (request, { projectId }) =>
      expectOk(
        await request(
          "carol",
          `/projects/${projectId}/members/owner`,
          "PATCH",
          {
            role: "member",
          },
        ),
      ),
    "cancelled",
    true,
  ],
  [
    "voided because the recipient deleted their account",
    async (request) => expectOk(await deleteAccount(request, "bob")),
    "cancelled",
    true,
  ],
  [
    "expired",
    async (_request, { transferId }) => {
      await env.DB.prepare(
        "update project_ownership_transfers set expires_at = ? where id = ?",
      )
        .bind(new Date(Date.now() - 1000).toISOString(), transferId)
        .run();
    },
    "expired",
    false,
  ],
];

describe("recipient's open Checkout after a transfer request ends", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it.each(
    endings,
  )("is handed to the hourly not-switched settlement when the request is %s and the immediate expiry did not happen", async (_label, endTransfer, endedStatus, expiresImmediately) => {
    const {
      bindings,
      request,
      expireTransferCheckout,
      settleOwnershipTransfer,
    } = setup();
    const seeded = await seedTransfer(request);

    await endTransfer(request, seeded);

    if (expiresImmediately) {
      expect(expireTransferCheckout).toHaveBeenCalledWith({
        billingAccountId: "bob",
        projectId: seeded.projectId,
        transferId: seeded.transferId,
      });
    } else {
      expect(expireTransferCheckout).not.toHaveBeenCalled();
    }
    expect(settleOwnershipTransfer).not.toHaveBeenCalled();

    const notSwitched = expect.objectContaining({
      projectId: seeded.projectId,
      transferId: seeded.transferId,
      outcome: "not-switched",
      toBillingAccountId: "bob",
    });
    await runHourlyJob(bindings);
    expect(settleOwnershipTransfer).toHaveBeenCalledWith(notSwitched);
    expect(await transferRow(seeded.transferId)).toMatchObject({
      status: endedStatus,
      outcome: "not-switched",
      settlement: "pending",
    });

    await runHourlyJob(bindings);
    expect(settleOwnershipTransfer).toHaveBeenCalledTimes(2);
    expect(settleOwnershipTransfer).toHaveBeenLastCalledWith(notSwitched);
  });
});
