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
  lifecycle?: "live" | "ending" | "ended" | null;
  listFails?: boolean;
  selfHosted?: boolean;
};

const setup = (options: Options = {}) => {
  const listProjectBilling = vi.fn(
    async ({
      billingAccountId,
      projectIds,
    }: {
      billingAccountId: string;
      projectIds: string[];
    }) => {
      if (options.listFails) throw new Error("cp down");
      return {
        projects: projectIds.map((projectId) => ({
          projectId,
          entitlementState: "active",
          subscription:
            billingAccountId !== "owner" || options.lifecycle === null
              ? null
              : {
                  lifecycle: options.lifecycle ?? "live",
                  endsAt: null,
                  nextBilling: { status: "none" as const },
                  transferId: null,
                },
        })),
      };
    },
  );
  const bindings = (options.selfHosted
    ? { DB: env.DB }
    : {
        DB: env.DB,
        ENTITLEMENT_MODE: "control-plane",
        CONTROL_PLANE: {
          getProjectEntitlement: vi.fn(),
          listProjectBilling,
        },
      }) as unknown as Bindings;
  const call = async (
    userId: string,
    projectId: string,
    method: "GET" | "POST",
    suffix = "",
    explicitBody?: unknown,
  ) => {
    let body = explicitBody;
    if (body === undefined && (suffix === "/cancel" || suffix === "/decline")) {
      const row = await env.DB.prepare(
        "select id from project_ownership_transfers where project_id = ? order by created_at desc limit 1",
      )
        .bind(projectId)
        .first<{ id: string }>();
      body = { transferId: row?.id ?? "none" };
    }
    return buildApp(userId).request(
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
  };
  return { call, listProjectBilling };
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

describe("ownership transfer request routes", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("lets the paying owner nominate an existing member without changing roles", async () => {
    const projectId = await createProject("owner");
    await addMember(projectId, "bob", "member");
    const { call } = setup();

    const created = await call("owner", projectId, "POST", "", {
      toUserId: "bob",
    });
    expect(created.status).toBe(201);
    expect(
      ((await created.json()) as { transfer: unknown }).transfer,
    ).toMatchObject({
      fromUserId: "owner",
      toUserId: "bob",
      role: "requester",
    });

    const members = await env.DB.prepare(
      "select user_id, role from project_members where project_id = ? order by user_id",
    )
      .bind(projectId)
      .all();
    expect(members.results).toEqual([
      { user_id: "bob", role: "member" },
      { user_id: "owner", role: "owner" },
    ]);
  });

  it("shows the transfer to both parties and hides it from third parties", async () => {
    const projectId = await createProject("owner");
    await addMember(projectId, "bob", "member");
    await addMember(projectId, "carol", "member");
    const { call } = setup();
    await call("owner", projectId, "POST", "", { toUserId: "bob" });

    const asRecipient = await call("bob", projectId, "GET");
    expect(
      ((await asRecipient.json()) as { transfer: { role: string } }).transfer
        .role,
    ).toBe("recipient");
    const asRequester = await call("owner", projectId, "GET");
    expect(
      ((await asRequester.json()) as { transfer: { role: string } }).transfer
        .role,
    ).toBe("requester");
    const asThird = await call("carol", projectId, "GET");
    expect(await asThird.json()).toEqual({ transfer: null });
    const asOutsider = await call("mallory", projectId, "GET");
    expect(asOutsider.status).toBe(404);
  });

  it("rejects non-owners, outsiders, self, non-members and other-project members", async () => {
    const projectId = await createProject("owner");
    const otherId = await createProject("someone");
    await addMember(otherId, "dave", "member");
    await addMember(projectId, "bob", "member");
    const { call } = setup();

    expect(
      (await call("bob", projectId, "POST", "", { toUserId: "owner" })).status,
    ).toBe(403);
    expect(
      (await call("mallory", projectId, "POST", "", { toUserId: "bob" }))
        .status,
    ).toBe(404);
    expect(
      (await call("owner", projectId, "POST", "", { toUserId: "owner" }))
        .status,
    ).toBe(422);
    expect(
      (await call("owner", projectId, "POST", "", { toUserId: "dave" })).status,
    ).toBe(422);
    expect((await call("owner", projectId, "POST", "", {})).status).toBe(400);
  });

  it("allows an owner to request a transfer without consulting billing details", async () => {
    const projectId = await createProject("owner");
    await addMember(projectId, "co", "owner");
    await addMember(projectId, "bob", "member");
    const { call, listProjectBilling } = setup({ listFails: true });
    const response = await call("co", projectId, "POST", "", {
      toUserId: "bob",
    });
    expect(response.status).toBe(201);
    expect(listProjectBilling).not.toHaveBeenCalled();
  });

  it("allows only one pending transfer per project", async () => {
    const projectId = await createProject("owner");
    await addMember(projectId, "bob", "member");
    await addMember(projectId, "carol", "member");
    const { call } = setup();

    const results = await Promise.all([
      call("owner", projectId, "POST", "", { toUserId: "bob" }),
      call("owner", projectId, "POST", "", { toUserId: "carol" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it("lets only the requester cancel and only the recipient decline", async () => {
    const projectId = await createProject("owner");
    await addMember(projectId, "bob", "member");
    const { call } = setup();
    await call("owner", projectId, "POST", "", { toUserId: "bob" });

    expect((await call("bob", projectId, "POST", "/cancel")).status).toBe(403);
    expect((await call("owner", projectId, "POST", "/decline")).status).toBe(
      403,
    );
    expect((await call("owner", projectId, "POST", "/cancel")).status).toBe(
      200,
    );
    expect((await call("owner", projectId, "POST", "/cancel")).status).toBe(
      409,
    );
    expect(await (await call("bob", projectId, "GET")).json()).toEqual({
      transfer: null,
    });

    await call("owner", projectId, "POST", "", { toUserId: "bob" });
    expect((await call("bob", projectId, "POST", "/decline")).status).toBe(200);
    expect(await (await call("owner", projectId, "GET")).json()).toEqual({
      transfer: null,
    });
  });

  it("refuses to close a transfer other than the one that was displayed", async () => {
    const projectId = await createProject("owner");
    await addMember(projectId, "bob", "member");
    const { call } = setup();
    await call("owner", projectId, "POST", "", { toUserId: "bob" });

    const stale = await call("owner", projectId, "POST", "/cancel", {
      transferId: "old",
    });
    expect(stale.status).toBe(409);
    expect((await call("owner", projectId, "GET")).status).toBe(200);
    expect(
      (
        (await (await call("owner", projectId, "GET")).json()) as {
          transfer: unknown;
        }
      ).transfer,
    ).not.toBeNull();
  });

  it("rejects cancel and decline after a party loses eligibility", async () => {
    const projectId = await createProject("owner");
    await addMember(projectId, "bob", "member");
    const { call } = setup();
    await call("owner", projectId, "POST", "", { toUserId: "bob" });
    await env.DB.prepare(
      "update project_members set role = 'member' where project_id = ? and user_id = 'owner'",
    )
      .bind(projectId)
      .run();

    expect((await call("bob", projectId, "POST", "/decline")).status).toBe(409);
    await env.DB.prepare(
      "update project_members set role = 'owner' where project_id = ? and user_id = 'owner'",
    )
      .bind(projectId)
      .run();
    expect(await (await call("owner", projectId, "GET")).json()).toEqual({
      transfer: null,
    });
  });

  it("expires after 7 days and then allows a new request", async () => {
    const projectId = await createProject("owner");
    await addMember(projectId, "bob", "member");
    const { call } = setup();
    await call("owner", projectId, "POST", "", { toUserId: "bob" });
    await env.DB.prepare(
      "update project_ownership_transfers set expires_at = ? where project_id = ?",
    )
      .bind(new Date(Date.now() - 1000).toISOString(), projectId)
      .run();

    expect(await (await call("bob", projectId, "GET")).json()).toEqual({
      transfer: null,
    });
    expect((await call("bob", projectId, "POST", "/decline")).status).toBe(409);
    expect(
      (await call("owner", projectId, "POST", "", { toUserId: "bob" })).status,
    ).toBe(201);
  });

  it("voids a pending transfer when a party loses eligibility", async () => {
    const projectId = await createProject("owner");
    await addMember(projectId, "bob", "member");
    const { call } = setup();
    await call("owner", projectId, "POST", "", { toUserId: "bob" });
    await env.DB.prepare(
      "delete from project_members where project_id = ? and user_id = ?",
    )
      .bind(projectId, "bob")
      .run();

    expect(await (await call("owner", projectId, "GET")).json()).toEqual({
      transfer: null,
    });
    await addMember(projectId, "carol", "member");
    expect(
      (await call("owner", projectId, "POST", "", { toUserId: "carol" }))
        .status,
    ).toBe(201);
  });

  it("is unavailable on self-hosted deployments", async () => {
    const projectId = await createProject("owner");
    const { call } = setup({ selfHosted: true });
    expect((await call("owner", projectId, "GET")).status).toBe(409);
  });
});
