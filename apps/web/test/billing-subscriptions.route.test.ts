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

const subscription = (projectId: string) => ({
  projectId,
  entitlementState: "active" as const,
  subscription: {
    lifecycle: "live",
    endsAt: null,
    nextBilling: {
      status: "scheduled" as const,
      date: "2026-12-19T00:00:00.000Z",
      amount: 3850,
      currency: "jpy",
    },
    transferId: null,
  },
});

const setup = (
  listProjectBilling: ReturnType<typeof vi.fn>,
  syncProjectDisplayNames: ReturnType<typeof vi.fn> = vi.fn(async () => ({
    updatedSubscriptionCount: 0,
  })),
) => {
  const bindings = {
    DB: env.DB,
    ENTITLEMENT_MODE: "control-plane",
    CONTROL_PLANE: {
      getProjectEntitlement: vi.fn(),
      createCheckoutSession: vi.fn(),
      createPortalSession: vi.fn(),
      listProjectBilling,
      syncProjectDisplayNames,
    },
  } as unknown as Bindings;
  const get = (userId: string, overrides: Partial<Bindings> = {}) =>
    buildApp(userId).request(
      "https://tatsumaki.example/billing/subscriptions",
      { method: "GET" },
      { ...bindings, ...overrides },
    );
  return { get };
};

const createProject = async (name: string, ownerUserId: string) => {
  const result = await new D1ProjectRepository(env.DB).create({
    name,
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

describe("billing subscriptions route", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("asks the Control Plane only about projects the current user owns", async () => {
    const owned = await createProject("Owned", "user-1");
    const other = await createProject("Not mine", "user-2");
    const joined = await createProject("Joined", "user-2");
    await addMember(joined, "user-1", "member");
    const viewing = await createProject("Viewing", "user-2");
    await addMember(viewing, "user-1", "viewer");
    const listProjectBilling = vi.fn(
      async ({ projectIds }: { projectIds: string[] }) => ({
        projects: projectIds.map(subscription),
      }),
    );

    const response = await setup(listProjectBilling).get("user-1");

    expect(response.status).toBe(200);
    expect(listProjectBilling).toHaveBeenCalledWith({
      billingAccountId: "user-1",
      projectIds: [owned],
    });
    expect(listProjectBilling.mock.calls[0]?.[0].projectIds).not.toContain(
      other,
    );
    expect(await response.json()).toEqual({
      projects: [{ ...subscription(owned), projectName: "Owned" }],
    });
  });

  it("repairs subscription display names for owned projects and still lists when that fails", async () => {
    const owned = await createProject("Owned", "user-1");
    const listProjectBilling = vi.fn(
      async ({ projectIds }: { projectIds: string[] }) => ({
        projects: projectIds.map(subscription),
      }),
    );
    const syncProjectDisplayNames = vi
      .fn()
      .mockRejectedValueOnce(new Error("cp down"))
      .mockResolvedValue({ updatedSubscriptionCount: 1 });
    const { get } = setup(listProjectBilling, syncProjectDisplayNames);

    expect((await get("user-1")).status).toBe(200);
    expect((await get("user-1")).status).toBe(200);

    expect(syncProjectDisplayNames).toHaveBeenCalledWith({
      billingAccountId: "user-1",
      projects: [{ projectId: owned, name: "Owned" }],
    });
  });

  it("lists multiple owned projects as separate rows", async () => {
    await createProject("A", "user-1");
    await createProject("B", "user-1");
    const listProjectBilling = vi.fn(
      async ({ projectIds }: { projectIds: string[] }) => ({
        projects: projectIds.map(subscription),
      }),
    );

    const response = await setup(listProjectBilling).get("user-1");
    const body = (await response.json()) as {
      projects: { projectName: string }[];
    };

    expect(body.projects.map((p) => p.projectName).sort()).toEqual(["A", "B"]);
  });

  it("returns an empty list without calling the Control Plane when nothing is owned", async () => {
    const joined = await createProject("Joined", "user-2");
    await addMember(joined, "user-1", "member");
    const listProjectBilling = vi.fn();

    const response = await setup(listProjectBilling).get("user-1");

    expect(await response.json()).toEqual({ projects: [] });
    expect(listProjectBilling).not.toHaveBeenCalled();
  });

  it("returns 503 instead of an empty list when the Control Plane fails", async () => {
    await createProject("Owned", "user-1");
    const response = await setup(
      vi.fn(async () => {
        throw new Error("down");
      }),
    ).get("user-1");
    expect(response.status).toBe(503);
  });

  it("returns 503 when the Control Plane reports an unrequested project", async () => {
    await createProject("Owned", "user-1");
    const response = await setup(
      vi.fn(async () => ({ projects: [subscription("someone-elses")] })),
    ).get("user-1");
    expect(response.status).toBe(503);
  });

  it("returns 503 when the Control Plane response is malformed", async () => {
    await createProject("Owned", "user-1");
    const response = await setup(
      vi.fn(async () => ({ projects: [{ projectId: "x" }] })),
    ).get("user-1");
    expect(response.status).toBe(503);
  });

  it("returns 503 when an owned project is missing from the response", async () => {
    await createProject("Owned", "user-1");
    const response = await setup(vi.fn(async () => ({ projects: [] }))).get(
      "user-1",
    );
    expect(response.status).toBe(503);
  });

  it("is unavailable in self-hosted mode", async () => {
    const response = await setup(vi.fn()).get("user-1", {
      ENTITLEMENT_MODE: undefined,
    });
    expect(response.status).toBe(409);
  });
});
