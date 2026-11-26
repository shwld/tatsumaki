import { SELF, env as testEnv } from "cloudflare:test";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import { invitationLinksRoute } from "../src/presentation/routes/invitation-links";
import { projectsRoute } from "../src/presentation/routes/projects";
import { projectUsage } from "./helpers/project-usage";

const JOINER = { id: "github|joiner", email: "joiner@example.com" };

let projectId = "";
let ownerId = "";
let token = "";

const app = new Hono<any>();
app.use("*", async (c, next) => {
  c.set("currentUser", JOINER);
  await next();
});
app.route("/api", invitationLinksRoute);
app.route("/api", projectsRoute);

const bindings = (
  getProjectUsage: () => Promise<unknown>,
  overrides: Record<string, unknown> = {},
) => ({
  DB: testEnv.DB,
  ENTITLEMENT_MODE: "control-plane",
  PROJECT_WRITE_ENFORCEMENT: "true",
  CONTROL_PLANE: { getProjectUsage },
  ...overrides,
});

const acceptLink = (env: Record<string, unknown>) =>
  app.request(
    "/api/invitation-links/accept",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    },
    env,
  );

let targetedId = "";
const acceptTargeted = (env: Record<string, unknown>) =>
  app.request(
    `/api/projects/${projectId}/invitations/${targetedId}/accept`,
    { method: "POST" },
    env,
  );

const memberCount = async () =>
  (
    await testEnv.DB.prepare(
      "SELECT COUNT(*) AS n FROM project_members WHERE project_id = ?",
    )
      .bind(projectId)
      .first<{ n: number }>()
  )?.n;

const pendingCount = async () =>
  (
    await testEnv.DB.prepare(
      "SELECT COUNT(*) AS n FROM project_invitations WHERE project_id = ? AND status = 'pending'",
    )
      .bind(projectId)
      .first<{ n: number }>()
  )?.n;

beforeEach(async () => {
  await resetDatabase(testEnv.DB);
  await setupAccessBindings(testEnv);
  const headers = {
    ...(await createAuthHeaders({ sub: "github|owner" })),
    "content-type": "application/json",
  };
  const created = await SELF.fetch("https://localhost/api/projects", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Invite Billing" }),
  });
  projectId = ((await created.json()) as { project: { id: string } }).project
    .id;
  ownerId = (await testEnv.DB.prepare(
    "SELECT user_id FROM project_members WHERE project_id = ?",
  )
    .bind(projectId)
    .first<{ user_id: string }>())!.user_id;
  const link = await SELF.fetch(
    `https://localhost/api/projects/${projectId}/invitation-links`,
    { method: "POST", headers, body: JSON.stringify({ role: "member" }) },
  );
  token = new URL(((await link.json()) as { url: string }).url).hash.slice(1);
  await testEnv.DB.prepare(
    "INSERT INTO users (id, display_name, email, access_status) VALUES (?, 'Joiner', ?, 'allowed')",
  )
    .bind(JOINER.id, JOINER.email)
    .run();
  const targeted = await new D1ProjectRepository(testEnv.DB).createInvitation({
    projectId,
    inviterUserId: ownerId,
    targetUserId: JOINER.id,
    targetEmail: null,
    role: "member",
    expiresAt: "2999-01-01T00:00:00.000Z",
  });
  targetedId = targeted._unsafeUnwrap().id;
});

const methods = [
  ["single-use link", acceptLink],
  ["targeted invitation", acceptTargeted],
] as const;

describe.each(methods)("%s accept billing gate", (_name, accept) => {
  it("rejects a suspended project and leaves state untouched, then joins after resume", async () => {
    const before = await pendingCount();
    const res = await accept(
      bindings(async () => projectUsage("read_only", { projectId })),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "PROJECT_SUSPENDED" });
    expect(await memberCount()).toBe(1);
    expect(await pendingCount()).toBe(before);

    const resumed = await accept(
      bindings(async () => projectUsage("available", { projectId })),
    );
    expect(resumed.status).toBe(200);
    expect(await memberCount()).toBe(2);
  });

  it("returns 503 when the control plane is unknown and nothing is cached", async () => {
    const before = await pendingCount();
    const res = await accept(
      bindings(async () => {
        throw new Error("down");
      }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
    expect(await memberCount()).toBe(1);
    expect(await pendingCount()).toBe(before);
  });

  it("allows active projects and non-enforcing deployments", async () => {
    expect(
      (
        await accept(
          bindings(async () => projectUsage("available", { projectId })),
        )
      ).status,
    ).toBe(200);
  });

  it("allows when enforcement is off", async () => {
    const res = await accept(
      bindings(async () => projectUsage("read_only", { projectId }), {
        PROJECT_WRITE_ENFORCEMENT: "false",
      }),
    );
    expect(res.status).toBe(200);
  });
});

describe("accept keeps existing errors", () => {
  it("answers 410 for an unknown token without consulting billing", async () => {
    token = "A".repeat(43);
    let called = 0;
    const res = await acceptLink(
      bindings(async () => {
        called += 1;
        return projectUsage("read_only", { projectId });
      }),
    );
    expect(res.status).toBe(410);
    expect(called).toBe(0);
  });
});
