import { env } from "cloudflare:test";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bindings, Env } from "../src/index";
import type { CurrentUser } from "../src/presentation/middleware/access-auth";
import { D1ProjectCreationRequestRepository } from "../src/infrastructure/db/repositories/d1-project-creation-request-repository";
import { projectCreationRequestsRoute } from "../src/presentation/routes/project-creation-requests";
import { projectsRoute } from "../src/presentation/routes/projects";
import { resetDatabase } from "./helpers/db";

const ORIGIN = "https://tatsumaki.example";

const buildApp = (userId: string) => {
  const app = new Hono<Env>();
  app.use(async (c, next) => {
    c.set("currentUser", { id: userId } as CurrentUser);
    await next();
  });
  app.route("/", projectCreationRequestsRoute);
  app.route("/", projectsRoute);
  return app;
};

type Fake = {
  state: "active" | "grace" | "suspended";
  fail: boolean;
  checkoutFail: boolean;
  entitlementProjectId: string | null;
};

const setup = () => {
  const fake: Fake = {
    state: "suspended",
    fail: false,
    checkoutFail: false,
    entitlementProjectId: null,
  };
  const createCheckoutSession = vi.fn(async () => {
    if (fake.checkoutFail) throw new Error("down");
    return { url: "https://checkout.stripe.com/c/pay/cs_test" };
  });
  const getProjectEntitlement = vi.fn(
    async ({ projectId }: { projectId: string }) => {
      if (fake.fail) throw new Error("down");
      return {
        projectId: fake.entitlementProjectId ?? projectId,
        state: fake.state,
        validUntil: null,
        revision: 1,
        cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
      };
    },
  );
  const bindings = {
    DB: env.DB,
    ENTITLEMENT_MODE: "control-plane",
    CHECKOUT_ENABLED: "true",
    CONTROL_PLANE: {
      getProjectEntitlement,
      createCheckoutSession,
      createPortalSession: vi.fn(),
    },
  } as unknown as Bindings;
  const post = (
    userId: string,
    path: string,
    body: unknown,
    overrides: Partial<Bindings> = {},
  ) =>
    buildApp(userId).request(
      `${ORIGIN}${path}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      { ...bindings, ...overrides },
    );
  return { fake, createCheckoutSession, getProjectEntitlement, post };
};

const countProjects = async () =>
  (await env.DB.prepare("SELECT count(*) AS n FROM projects").first<{
    n: number;
  }>())!.n;

describe("project creation requests", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("opens a checkout without creating the project", async () => {
    const { post, createCheckoutSession } = setup();

    const response = await post("user-1", "/project-creation-requests", {
      name: " Alpha ",
      idempotencyKey: "key-12345678",
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      kind: string;
      projectId: string;
      url: string;
    };
    expect(body).toMatchObject({
      kind: "checkout",
      url: "https://checkout.stripe.com/c/pay/cs_test",
    });
    expect(createCheckoutSession).toHaveBeenCalledWith({
      billingAccountId: "user-1",
      projectId: body.projectId,
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      successUrl: `${ORIGIN}/projects/new/complete?request=${body.projectId}`,
      cancelUrl: `${ORIGIN}/projects/new?checkout=cancel`,
    });
    expect(await countProjects()).toBe(0);
  });

  it("reuses the same request for a repeated submit", async () => {
    const { post, createCheckoutSession } = setup();
    const submit = async () =>
      (await (
        await post("user-1", "/project-creation-requests", {
          name: "Alpha",
          idempotencyKey: "key-12345678",
        })
      ).json()) as { projectId: string };

    const first = await submit();
    const second = await submit();

    expect(second.projectId).toBe(first.projectId);
    const calls = createCheckoutSession.mock.calls as unknown as [
      { requestId: string },
    ][];
    expect(calls[1][0].requestId).toBe(calls[0][0].requestId);
  });

  it("does not start checkout when the flag is off", async () => {
    const { post, createCheckoutSession } = setup();
    const response = await post(
      "user-1",
      "/project-creation-requests",
      { name: "Alpha", idempotencyKey: "key-12345678" },
      { CHECKOUT_ENABLED: "false" },
    );
    expect(response.status).toBe(409);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects an empty name and a malformed idempotency key", async () => {
    const { post } = setup();
    expect(
      (
        await post("user-1", "/project-creation-requests", {
          name: "  ",
          idempotencyKey: "key-12345678",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post("user-1", "/project-creation-requests", {
          name: "A",
          idempotencyKey: "x",
        })
      ).status,
    ).toBe(400);
  });

  it("returns 503 when the Control Plane is unreachable", async () => {
    const { post, fake } = setup();
    fake.fail = true;
    const unreachable = await post("user-1", "/project-creation-requests", {
      name: "A",
      idempotencyKey: "key-12345678",
    });
    expect(unreachable.status).toBe(503);

    fake.fail = false;
    fake.checkoutFail = true;
    const checkoutDown = await post("user-1", "/project-creation-requests", {
      name: "A",
      idempotencyKey: "key-87654321",
    });
    expect(checkoutDown.status).toBe(503);
  });

  it("does not start a second checkout for a project that is already active", async () => {
    const { post, fake, createCheckoutSession } = setup();
    fake.state = "active";
    const response = await post("user-1", "/project-creation-requests", {
      name: "A",
      idempotencyKey: "key-12345678",
    });
    expect(await response.json()).toMatchObject({ kind: "ready" });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("refuses a new checkout while a payment needs attention", async () => {
    const { post, fake } = setup();
    fake.state = "grace";
    const response = await post("user-1", "/project-creation-requests", {
      name: "A",
      idempotencyKey: "key-12345678",
    });
    expect(response.status).toBe(409);
  });

  describe("completion", () => {
    const open = async (
      ctx: ReturnType<typeof setup>,
      userId = "user-1",
    ): Promise<string> => {
      const response = await ctx.post(userId, "/project-creation-requests", {
        name: "Alpha",
        idempotencyKey: "key-12345678",
      });
      return ((await response.json()) as { projectId: string }).projectId;
    };

    it("stays pending and creates nothing until the project is active", async () => {
      const ctx = setup();
      const projectId = await open(ctx);

      for (const state of ["suspended", "grace"] as const) {
        ctx.fake.state = state;
        const response = await ctx.post(
          "user-1",
          `/project-creation-requests/${projectId}/complete`,
          {},
        );
        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ status: "pending", state });
      }
      expect(await countProjects()).toBe(0);
    });

    it("creates the project with the pre-issued id and owner exactly once", async () => {
      const ctx = setup();
      const projectId = await open(ctx);
      ctx.fake.state = "active";

      const [a, b] = await Promise.all([
        ctx.post(
          "user-1",
          `/project-creation-requests/${projectId}/complete`,
          {},
        ),
        ctx.post(
          "user-1",
          `/project-creation-requests/${projectId}/complete`,
          {},
        ),
      ]);
      const again = await ctx.post(
        "user-1",
        `/project-creation-requests/${projectId}/complete`,
        {},
      );

      for (const response of [a, b, again]) {
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          status: "created",
          project: {
            id: projectId,
            name: "Alpha",
            sprintDurationDays: 14,
            currentUserRole: "owner",
          },
        });
      }
      expect(await countProjects()).toBe(1);
      const members = await env.DB.prepare(
        "SELECT user_id, role FROM project_members WHERE project_id = ?",
      )
        .bind(projectId)
        .all();
      expect(members.results).toEqual([{ user_id: "user-1", role: "owner" }]);
    });

    it("does not recreate a project that was deleted after creation", async () => {
      const ctx = setup();
      const projectId = await open(ctx);
      ctx.fake.state = "active";
      await ctx.post(
        "user-1",
        `/project-creation-requests/${projectId}/complete`,
        {},
      );
      await env.DB.prepare("DELETE FROM projects WHERE id = ?")
        .bind(projectId)
        .run();

      const response = await ctx.post(
        "user-1",
        `/project-creation-requests/${projectId}/complete`,
        {},
      );
      expect(response.status).toBe(404);
      expect(await countProjects()).toBe(0);
    });

    it("does not let a stale completion resurrect a deleted project", async () => {
      const ctx = setup();
      const projectId = await open(ctx);
      ctx.fake.state = "active";
      const repository = new D1ProjectCreationRequestRepository(env.DB);
      const stale = (await repository.findById(projectId))._unsafeUnwrap()!;
      await ctx.post(
        "user-1",
        `/project-creation-requests/${projectId}/complete`,
        {},
      );
      await env.DB.prepare("DELETE FROM projects WHERE id = ?")
        .bind(projectId)
        .run();

      const result = await repository.materialize(stale);

      expect(result.isErr()).toBe(true);
      expect(await countProjects()).toBe(0);
    });

    it("reports the current membership instead of assuming ownership", async () => {
      const ctx = setup();
      const projectId = await open(ctx);
      ctx.fake.state = "active";
      await ctx.post(
        "user-1",
        `/project-creation-requests/${projectId}/complete`,
        {},
      );

      await env.DB.prepare(
        "UPDATE project_members SET role = 'member' WHERE project_id = ?",
      )
        .bind(projectId)
        .run();
      const demoted = await ctx.post(
        "user-1",
        `/project-creation-requests/${projectId}/complete`,
        {},
      );
      expect(await demoted.json()).toMatchObject({
        project: { currentUserRole: "member" },
      });

      await env.DB.prepare("DELETE FROM project_members WHERE project_id = ?")
        .bind(projectId)
        .run();
      const removed = await ctx.post(
        "user-1",
        `/project-creation-requests/${projectId}/complete`,
        {},
      );
      expect(removed.status).toBe(404);
    });

    it("hides another user's request and an unknown project id", async () => {
      const ctx = setup();
      const projectId = await open(ctx);
      ctx.fake.state = "active";

      const other = await ctx.post(
        "user-2",
        `/project-creation-requests/${projectId}/complete`,
        {},
      );
      const unknown = await ctx.post(
        "user-1",
        "/project-creation-requests/01UNKNOWN/complete",
        {},
      );

      expect(other.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(await countProjects()).toBe(0);
    });

    it("rejects an entitlement that belongs to a different project", async () => {
      const ctx = setup();
      const projectId = await open(ctx);
      ctx.fake.state = "active";
      ctx.fake.entitlementProjectId = "someone-elses-project";

      const response = await ctx.post(
        "user-1",
        `/project-creation-requests/${projectId}/complete`,
        {},
      );
      expect(response.status).toBe(503);
      expect(await countProjects()).toBe(0);
    });

    it("returns 503 and creates nothing when the Control Plane is down", async () => {
      const ctx = setup();
      const projectId = await open(ctx);
      ctx.fake.fail = true;

      const response = await ctx.post(
        "user-1",
        `/project-creation-requests/${projectId}/complete`,
        {},
      );
      expect(response.status).toBe(503);
      expect(await countProjects()).toBe(0);
    });

    it("ignores a success URL parameter and never trusts the client", async () => {
      const ctx = setup();
      const projectId = await open(ctx);
      const response = await ctx.post(
        "user-1",
        `/project-creation-requests/${projectId}/complete?checkout=success`,
        { status: "paid" },
      );
      expect(response.status).toBe(202);
      expect(await countProjects()).toBe(0);
    });

    it("does not complete when checkout is disabled", async () => {
      const ctx = setup();
      const projectId = await open(ctx);
      ctx.fake.state = "active";
      const response = await ctx.post(
        "user-1",
        `/project-creation-requests/${projectId}/complete`,
        {},
        { CHECKOUT_ENABLED: "false" },
      );
      expect(response.status).toBe(409);
      expect(await countProjects()).toBe(0);
    });
  });

  it("rejects direct creation under an unsupported entitlement mode", async () => {
    const { post } = setup();
    const response = await post(
      "user-1",
      "/projects",
      { name: "Sneaky" },
      { ENTITLEMENT_MODE: "control-plan" },
    );
    expect(response.status).toBe(503);
    expect(await countProjects()).toBe(0);
  });

  it("refuses direct project creation in control-plane mode", async () => {
    const { post } = setup();
    const response = await post("user-1", "/projects", { name: "Sneaky" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "checkout_required" });
    expect(await countProjects()).toBe(0);
  });
});
