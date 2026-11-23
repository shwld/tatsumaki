import { env } from "cloudflare:test";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import { D1UserRepository } from "../src/infrastructure/db/repositories/d1-user-repository";
import type { Bindings, Env } from "../src/index";
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

const setup = (options: { expireFails?: boolean } = {}) => {
  const listProjectBilling = vi.fn(
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
              }
            : null,
      })),
    }),
  );
  const expireTransferCheckout = vi.fn(async (_input: unknown) => {
    if (options.expireFails) throw new Error("stripe down");
    return { expiredSessionCount: 1 };
  });
  const bindings = {
    DB: env.DB,
    ENTITLEMENT_MODE: "control-plane",
    CONTROL_PLANE: {
      getProjectEntitlement: vi.fn(),
      listProjectBilling,
      expireTransferCheckout,
    },
  } as unknown as Bindings;
  const request = (
    userId: string,
    path: string,
    method: string,
    body?: unknown,
  ) =>
    buildApp(userId).request(
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
    );
  const changeRole = (
    actor: string,
    projectId: string,
    userId: string,
    role: string,
  ) =>
    request(actor, `/projects/${projectId}/members/${userId}`, "PATCH", {
      role,
    });
  return { request, changeRole, expireTransferCheckout };
};

const addMember = (projectId: string, userId: string, role: string) =>
  env.DB.prepare(
    "insert into project_members (project_id, user_id, role) values (?, ?, ?)",
  )
    .bind(projectId, userId, role)
    .run();

const transferRow = (projectId: string) =>
  env.DB.prepare(
    "select id, status, settlement_outcome, settlement_status from project_ownership_transfers where project_id = ? order by created_at desc limit 1",
  )
    .bind(projectId)
    .first<{
      id: string;
      status: string;
      settlement_outcome: string | null;
      settlement_status: string | null;
    }>();

/** owner と co-owner の carol がいるプロジェクトで、owner が bob へ申請済みの状態を用意する。 */
const seedTransfer = async (request: ReturnType<typeof setup>["request"]) => {
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

describe("ownership transfer eligibility on membership changes", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("voids the request and expires the recipient's Checkout when the requester is demoted", async () => {
    const { request, changeRole, expireTransferCheckout } = setup();
    const { projectId, transferId } = await seedTransfer(request);

    const response = await changeRole("carol", projectId, "owner", "member");

    expect(response.status).toBe(200);
    expect(await transferRow(projectId)).toEqual({
      id: transferId,
      status: "cancelled",
      settlement_outcome: "not-switched",
      settlement_status: "pending",
    });
    expect(expireTransferCheckout).toHaveBeenCalledWith({
      billingAccountId: "bob",
      projectId,
      transferId,
    });
  });

  it("does not revive the request when the requester is promoted back without anyone viewing it", async () => {
    const { request, changeRole } = setup();
    const { projectId } = await seedTransfer(request);

    await changeRole("carol", projectId, "owner", "viewer");
    await changeRole("carol", projectId, "owner", "owner");

    expect((await transferRow(projectId))?.status).toBe("cancelled");
    expect(
      await (
        await request(
          "bob",
          `/billing/projects/${projectId}/ownership-transfer`,
          "GET",
        )
      ).json(),
    ).toEqual({ transfer: null });
  });

  it("keeps the request when a role change leaves both parties eligible", async () => {
    const { request, changeRole, expireTransferCheckout } = setup();
    const { projectId } = await seedTransfer(request);

    expect((await changeRole("owner", projectId, "bob", "viewer")).status).toBe(
      200,
    );
    expect(
      (await changeRole("owner", projectId, "carol", "member")).status,
    ).toBe(200);

    expect((await transferRow(projectId))?.status).toBe("pending");
    expect(expireTransferCheckout).not.toHaveBeenCalled();
  });

  it("keeps the request when demoting the sole owner is refused", async () => {
    const { request, changeRole, expireTransferCheckout } = setup();
    const { projectId } = await seedTransfer(request);
    await changeRole("owner", projectId, "carol", "member");

    const response = await changeRole("owner", projectId, "owner", "member");

    expect(response.status).toBe(409);
    expect((await transferRow(projectId))?.status).toBe("pending");
    expect(expireTransferCheckout).not.toHaveBeenCalled();
  });

  it("keeps the request ended even if expiring the Checkout fails", async () => {
    const { request, changeRole } = setup({ expireFails: true });
    const { projectId } = await seedTransfer(request);

    const response = await changeRole("carol", projectId, "owner", "member");

    expect(response.status).toBe(200);
    expect((await transferRow(projectId))?.status).toBe("cancelled");
  });

  it("voids the request when the recipient deletes their account, and it stays void after they rejoin", async () => {
    const { request, expireTransferCheckout } = setup();
    const { projectId, transferId } = await seedTransfer(request);
    const users = new D1UserRepository(env.DB);
    await users.create({
      id: "bob",
      displayName: "Bob",
      email: "bob@example.com",
    });

    const response = await request("bob", "/auth/me", "DELETE", {
      confirmEmail: "bob@example.com",
    });

    expect(response.status).toBe(200);
    expect((await transferRow(projectId))?.status).toBe("cancelled");
    expect(expireTransferCheckout).toHaveBeenCalledWith({
      billingAccountId: "bob",
      projectId,
      transferId,
    });

    await addMember(projectId, "bob", "member");
    expect((await transferRow(projectId))?.status).toBe("cancelled");
    expect(
      await (
        await request(
          "bob",
          `/billing/projects/${projectId}/ownership-transfer`,
          "GET",
        )
      ).json(),
    ).toEqual({ transfer: null });
  });

  it("voids the request when the requester deletes their account", async () => {
    const { request, expireTransferCheckout } = setup();
    const { projectId, transferId } = await seedTransfer(request);
    const users = new D1UserRepository(env.DB);
    await users.create({
      id: "owner",
      displayName: "Owner",
      email: "owner@example.com",
    });

    const response = await request("owner", "/auth/me", "DELETE", {
      confirmEmail: "owner@example.com",
    });

    expect(response.status).toBe(200);
    expect((await transferRow(projectId))?.status).toBe("cancelled");
    expect(expireTransferCheckout).toHaveBeenCalledWith({
      billingAccountId: "bob",
      projectId,
      transferId,
    });
  });

  it("leaves other projects' requests untouched", async () => {
    const { request, changeRole } = setup();
    const first = await seedTransfer(request);
    const second = await seedTransfer(request);

    await changeRole("carol", first.projectId, "owner", "member");

    expect((await transferRow(first.projectId))?.status).toBe("cancelled");
    expect((await transferRow(second.projectId))?.status).toBe("pending");
  });
});
