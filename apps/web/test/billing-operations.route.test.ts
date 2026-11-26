import { env } from "cloudflare:test";
import { Hono } from "hono";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import type { Bindings, Env } from "../src/index";
import type { CurrentUser } from "../src/presentation/middleware/access-auth";
import { billingRoute } from "../src/presentation/routes/billing";
import { resetDatabase } from "./helpers/db";
import { projectUsage, type UsageKind } from "./helpers/project-usage";

const buildApp = (userId: string) => {
  const app = new Hono<Env>();
  app.use(async (c, next) => {
    c.set("currentUser", { id: userId } as CurrentUser);
    await next();
  });
  app.route("/", billingRoute);
  return app;
};

type ListInput = { accountId: string; projectIds: string[]; locale: string };

const offer =
  (operations: string[], notice: unknown = null) =>
  async ({ projectIds }: ListInput) => ({
    accountOperations: ["manage"],
    projects: projectIds.map((projectId) => ({
      projectId,
      operations,
      notice,
    })),
  });

type Options = {
  list?: (input: ListInput) => Promise<unknown>;
  start?: () => Promise<unknown>;
  usage?: UsageKind;
  overrides?: Partial<Bindings>;
};

const setup = (options: Options = {}) => {
  const session = async () => ({ url: "https://provider.example/session" });
  const controlPlane = {
    getProjectUsage: vi.fn(async ({ projectId }: { projectId: string }) =>
      projectUsage(options.usage, { projectId }),
    ),
    listProjectOperations: vi.fn(options.list ?? offer(["stop", "manage"])),
    startProjectOperation: vi.fn(
      async (_input: Record<string, string>) =>
        await (options.start ?? session)(),
    ),
    startAccountOperation: vi.fn(
      async () => await (options.start ?? session)(),
    ),
    syncProjectDisplayNames: vi.fn(async () => ({})),
  };
  const bindings = {
    DB: env.DB,
    ENTITLEMENT_MODE: "control-plane",
    PROJECT_WRITE_ENFORCEMENT: "true",
    CHECKOUT_ENABLED: "true",
    CONTROL_PLANE: controlPlane,
    ...options.overrides,
  } as unknown as Bindings;
  const request = (userId: string, path: string, method = "POST") =>
    buildApp(userId).request(
      `https://tatsumaki.example${path}`,
      { method },
      bindings,
    );
  return {
    controlPlane,
    list: (userId: string, query = "") =>
      request(userId, `/billing/operations${query}`, "GET"),
    start: (userId: string, projectId: string, operation: string, query = "") =>
      request(
        userId,
        `/billing/projects/${projectId}/operations/${operation}${query}`,
      ),
    startAccount: (userId: string) =>
      request(userId, "/billing/account-operations/manage"),
  };
};

const createProject = async (ownerUserId: string, name = "P") => {
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

beforeEach(async () => {
  await resetDatabase(env.DB);
});

describe("owned project operations", () => {
  it("asks only about owned projects and returns their state and operations", async () => {
    const owned = await createProject("user-1", "Owned");
    await createProject("user-2", "Not mine");
    const joined = await createProject("user-2", "Joined");
    await addMember(joined, "user-1", "member");
    const { list, controlPlane } = setup({ usage: "ending" });

    const response = await list("user-1", "?locale=en");

    expect(response.status).toBe(200);
    expect(controlPlane.listProjectOperations).toHaveBeenCalledWith({
      accountId: "user-1",
      projectIds: [owned],
      locale: "en",
    });
    expect(await response.json()).toEqual({
      operationsAvailable: true,
      accountOperations: ["manage"],
      projects: [
        {
          projectId: owned,
          projectName: "Owned",
          access: {
            kind: "limited",
            until: "2999-01-01T00:00:00Z",
            untilReason: "ending",
          },
          operations: ["stop", "manage"],
          notice: null,
        },
      ],
    });
    expect(controlPlane.syncProjectDisplayNames).toHaveBeenCalledWith({
      billingAccountId: "user-1",
      projects: [{ projectId: owned, name: "Owned" }],
    });
  });

  it("still lists when the display name repair fails", async () => {
    await createProject("user-1");
    const { list, controlPlane } = setup();
    controlPlane.syncProjectDisplayNames.mockRejectedValue(new Error("down"));
    expect((await list("user-1")).status).toBe(200);
  });

  it("offers account operations without owned projects", async () => {
    const { list } = setup();
    expect(await (await list("user-1")).json()).toEqual({
      operationsAvailable: true,
      accountOperations: ["manage"],
      projects: [],
    });
  });

  it("hides resume while checkout is disabled", async () => {
    await createProject("user-1");
    const { list } = setup({
      list: offer(["resume"]),
      usage: "read_only",
      overrides: { CHECKOUT_ENABLED: "false" },
    });
    expect(await (await list("user-1")).json()).toMatchObject({
      projects: [{ access: { kind: "read_only" }, operations: [] }],
    });
  });

  it.each([
    [
      "the provider fails",
      async () => {
        throw new Error("down");
      },
    ],
    [
      "a project that was not requested is returned",
      async () => ({
        accountOperations: [],
        projects: [{ projectId: "other", operations: [], notice: null }],
      }),
    ],
    [
      "an owned project is missing",
      async () => ({ accountOperations: ["manage"], projects: [] }),
    ],
    ["an unknown operation is offered", offer(["delete"])],
    [
      "a notice points to a non-https destination",
      offer(["manage"], { text: "x", url: "javascript:alert(1)" }),
    ],
  ])("offers no operation when %s", async (_name, listProjectOperations) => {
    await createProject("user-1");
    const { list } = setup({ list: listProjectOperations });

    const response = await list("user-1");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      operationsAvailable: false,
      accountOperations: [],
      projects: [
        { access: { kind: "available" }, operations: [], notice: null },
      ],
    });
  });

  it("is unavailable on self-hosted", async () => {
    const { list } = setup({ overrides: { ENTITLEMENT_MODE: undefined } });
    expect((await list("user-1")).status).toBe(409);
  });
});

describe("starting a project operation", () => {
  it.each([
    "resolve",
    "stop",
    "manage",
  ])("returns the destination of %s for the owner", async (operation) => {
    const projectId = await createProject("owner");
    const { start, controlPlane } = setup();

    const response = await start("owner", projectId, operation);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      url: "https://provider.example/session",
    });
    expect(controlPlane.startProjectOperation).toHaveBeenCalledWith({
      accountId: "owner",
      projectId,
      operation,
      returnUrl: `https://tatsumaki.example/account?operation=${operation}`,
    });
  });

  it("returns to Project Settings when started from there", async () => {
    const projectId = await createProject("owner");
    const { start, controlPlane } = setup();
    await start("owner", projectId, "stop", "?from=settings");
    expect(controlPlane.startProjectOperation.mock.calls[0]?.[0]).toMatchObject(
      {
        returnUrl: `https://tatsumaki.example/projects/${projectId}/settings?operation=stop`,
      },
    );
  });

  it("resumes the same project with return URLs back to it", async () => {
    const projectId = await createProject("owner", "Resumed");
    const { start, controlPlane } = setup({ usage: "read_only" });

    expect((await start("owner", projectId, "resume")).status).toBe(201);

    expect(controlPlane.startProjectOperation).toHaveBeenCalledWith({
      accountId: "owner",
      projectId,
      operation: "resume",
      projectName: "Resumed",
      requestId: expect.any(String),
      successUrl: `https://tatsumaki.example/projects/${projectId}?operation=resume`,
      cancelUrl: `https://tatsumaki.example/projects/${projectId}?operation=resume-cancel`,
    });
  });

  it("uses the same request id for repeated resumes", async () => {
    const projectId = await createProject("owner");
    const { start, controlPlane } = setup();
    await Promise.all([
      start("owner", projectId, "resume"),
      start("owner", projectId, "resume"),
    ]);
    const ids = controlPlane.startProjectOperation.mock.calls.map(
      (call) => call[0].requestId,
    );
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(z.uuid().safeParse(ids[0]).success).toBe(true);
  });

  it("refuses to resume while checkout is disabled", async () => {
    const projectId = await createProject("owner");
    const { start, controlPlane } = setup({
      overrides: { CHECKOUT_ENABLED: "false" },
    });
    const response = await start("owner", projectId, "resume");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "operation_not_offered",
    });
    expect(controlPlane.startProjectOperation).not.toHaveBeenCalled();
    expect((await start("owner", projectId, "manage")).status).toBe(201);
  });

  it("refuses to resume a project whose deletion was accepted", async () => {
    const projectId = await createProject("owner");
    await env.DB.prepare(
      "insert into project_deletion_requests (project_id, requested_by_user_id) values (?, ?)",
    )
      .bind(projectId, "owner")
      .run();
    const { start, controlPlane } = setup();

    const response = await start("owner", projectId, "resume");

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "project_deleting" });
    expect(controlPlane.startProjectOperation).not.toHaveBeenCalled();
  });

  it("rejects other members and hides the project from non-members", async () => {
    const projectId = await createProject("owner");
    await addMember(projectId, "member", "member");
    const { start, controlPlane } = setup();

    expect((await start("member", projectId, "manage")).status).toBe(403);
    expect((await start("stranger", projectId, "manage")).status).toBe(404);
    expect(controlPlane.startProjectOperation).not.toHaveBeenCalled();
  });

  it("rejects an unknown operation", async () => {
    const projectId = await createProject("owner");
    const { start, controlPlane } = setup();
    expect((await start("owner", projectId, "delete")).status).toBe(404);
    expect(controlPlane.startProjectOperation).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the provider refuses",
      async () => {
        throw new Error("OPERATION_UNAVAILABLE secret-token");
      },
    ],
    [
      "the destination is not https",
      async () => ({ url: "http://provider.example/secret-token" }),
    ],
  ])("returns no destination and logs none when %s", async (_name, answer) => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const projectId = await createProject("owner");
    const { start, startAccount } = setup({ start: answer });

    for (const response of [
      await start("owner", projectId, "manage"),
      await startAccount("owner"),
    ]) {
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("secret-token");
    }
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("secret-token");
    errorSpy.mockRestore();
  });

  it("is unavailable on self-hosted", async () => {
    const { start, startAccount } = setup({
      overrides: { ENTITLEMENT_MODE: undefined },
    });
    expect((await start("owner", "p1", "manage")).status).toBe(409);
    expect((await startAccount("owner")).status).toBe(409);
  });
});

describe("starting an account operation", () => {
  it("returns the destination for the current account only", async () => {
    const { startAccount, controlPlane } = setup();
    const response = await startAccount("user-1");
    expect(response.status).toBe(201);
    expect(controlPlane.startAccountOperation).toHaveBeenCalledWith({
      accountId: "user-1",
      operation: "manage",
      returnUrl: "https://tatsumaki.example/account?operation=manage",
    });
  });
});
