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
  acquisitionFail: boolean;
  entitlementProjectId: string | null;
  creationDenied: boolean;
};

const setup = () => {
  const fake: Fake = {
    state: "suspended",
    fail: false,
    acquisitionFail: false,
    entitlementProjectId: null,
    creationDenied: false,
  };
  const startAcquisition = vi.fn(async () => {
    if (fake.acquisitionFail) throw new Error("down");
    return { url: "https://provider.example/session" };
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
  const getCreationEligibility = vi.fn(
    async ({ projectId }: { projectId: string }) => {
      if (fake.fail) throw new Error("down");
      const id = fake.entitlementProjectId ?? projectId;
      if (fake.creationDenied) return { projectId: id, status: "denied" };
      return fake.state === "active"
        ? { projectId: id, status: "allowed" }
        : {
            projectId: id,
            status: "pending",
            deadline: "2099-01-01T00:00:00.000Z",
          };
    },
  );
  const bindings = {
    DB: env.DB,
    ENTITLEMENT_MODE: "control-plane",
    CONTROL_PLANE: {
      getProjectEntitlement,
      getCreationEligibility,
      startCreationAcquisition: startAcquisition,
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
  return { fake, startAcquisition, getProjectEntitlement, post };
};

const countProjects = async () =>
  (await env.DB.prepare("SELECT count(*) AS n FROM projects").first<{
    n: number;
  }>())!.n;

describe("project creation requests", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("starts an acquisition without creating the project", async () => {
    const { post, startAcquisition } = setup();

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
      kind: "redirect",
      url: "https://provider.example/session",
    });
    expect(startAcquisition).toHaveBeenCalledWith({
      accountId: "user-1",
      projectId: body.projectId,
      requestedAt: expect.any(String),
      projectName: expect.any(String),
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      successUrl: `${ORIGIN}/projects/new/complete?request=${body.projectId}`,
      cancelUrl: `${ORIGIN}/projects/new?acquisition=cancel`,
    });
    expect(await countProjects()).toBe(0);
  });

  it("reuses the same request for a repeated submit", async () => {
    const { post, startAcquisition } = setup();
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
    const calls = startAcquisition.mock.calls as unknown as [
      { requestId: string },
    ][];
    expect(calls[1][0].requestId).toBe(calls[0][0].requestId);
  });

  it("reports when the provider does not offer acquisition", async () => {
    const { post, fake, startAcquisition } = setup();
    fake.acquisitionFail = true;
    const response = await post("user-1", "/project-creation-requests", {
      name: "Alpha",
      idempotencyKey: "key-12345678",
    });
    expect(response.status).toBe(503);
    expect(startAcquisition).toHaveBeenCalledOnce();
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
    fake.acquisitionFail = true;
    const providerDown = await post("user-1", "/project-creation-requests", {
      name: "A",
      idempotencyKey: "key-87654321",
    });
    expect(providerDown.status).toBe(503);
  });

  it("does not start a second acquisition for a project that is already active", async () => {
    const { post, fake, startAcquisition } = setup();
    fake.state = "active";
    const response = await post("user-1", "/project-creation-requests", {
      name: "A",
      idempotencyKey: "key-12345678",
    });
    expect(await response.json()).toMatchObject({ kind: "ready" });
    expect(startAcquisition).not.toHaveBeenCalled();
  });

  it("leaves the acquisition decision to the provider", async () => {
    const { post, fake, startAcquisition } = setup();
    fake.state = "grace";
    fake.acquisitionFail = true;
    const response = await post("user-1", "/project-creation-requests", {
      name: "A",
      idempotencyKey: "key-12345678",
    });
    expect(response.status).toBe(503);
    expect(startAcquisition).toHaveBeenCalledOnce();
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
        expect(await response.json()).toEqual({ status: "pending" });
      }
      expect(await countProjects()).toBe(0);
    });

    it("does not create a project when the provider denies creation", async () => {
      const ctx = setup();
      const projectId = await open(ctx);
      ctx.fake.creationDenied = true;
      const response = await ctx.post(
        "user-1",
        `/project-creation-requests/${projectId}/complete`,
        {},
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ status: "denied" });
      expect(await countProjects()).toBe(0);
    });

    it("does not revive a denied request after a stale retry or materialization", async () => {
      const ctx = setup();
      const projectId = await open(ctx);
      const repository = new D1ProjectCreationRequestRepository(env.DB);
      const found = await repository.findById(projectId);
      if (found.isErr() || !found.value) throw new Error("missing request");
      expect(
        (
          await repository.markFailed(projectId, "2026-11-18T12:00:00.000Z")
        )._unsafeUnwrap(),
      ).toBe(true);
      await repository.recordAttempt({
        projectId,
        attemptCount: 1,
        materializeFailureCount: 0,
        nextAttemptAt: null,
        lastError: null,
        stalledReason: null,
      });
      expect((await repository.materialize(found.value)).isErr()).toBe(true);
      const outcomes = (await repository.listUnnotified(10))._unsafeUnwrap();
      expect(outcomes).toEqual([
        {
          projectId,
          accountId: "user-1",
          outcome: "failed",
          occurredAt: "2026-11-18T12:00:00.000Z",
        },
      ]);
      expect(await countProjects()).toBe(0);
    });

    it("commits exactly one outcome when completion races with denial", async () => {
      const ctx = setup();
      const projectId = await open(ctx);
      const repository = new D1ProjectCreationRequestRepository(env.DB);
      const found = await repository.findById(projectId);
      if (found.isErr() || !found.value) throw new Error("missing request");
      const [created, failed] = await Promise.all([
        repository.materialize(found.value),
        repository.markFailed(projectId, "2026-11-18T12:00:00.000Z"),
      ]);
      expect(failed.isOk()).toBe(true);
      const outcomes = (await repository.listUnnotified(10))._unsafeUnwrap();
      expect(outcomes).toHaveLength(1);
      if (outcomes[0].outcome === "created") {
        expect(created.isOk()).toBe(true);
        expect(await countProjects()).toBe(1);
        expect(failed._unsafeUnwrap()).toBe(false);
      } else {
        expect(created.isErr()).toBe(true);
        expect(await countProjects()).toBe(0);
        expect(failed._unsafeUnwrap()).toBe(true);
      }
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
        `/project-creation-requests/${projectId}/complete?acquisition=success`,
        { status: "allowed" },
      );
      expect(response.status).toBe(202);
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
    expect(await response.json()).toMatchObject({
      code: "acquisition_required",
    });
    expect(await countProjects()).toBe(0);
  });
});
