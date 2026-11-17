import { SELF, env as testEnv } from "cloudflare:test";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";
import { requireProjectWritable } from "../src/presentation/middleware/project-write-gate";

const entitlement = (state: string) => ({
  projectId,
  state,
  validUntil: null,
  revision: 1,
  cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
});

let projectId = "";
let userId = "";

beforeEach(async () => {
  await resetDatabase(testEnv.DB);
  await setupAccessBindings(testEnv);
  const response = await SELF.fetch("https://localhost/api/projects", {
    method: "POST",
    headers: {
      ...(await createAuthHeaders({ sub: "github|owner" })),
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "Gate" }),
  });
  projectId = ((await response.json()) as { project: { id: string } }).project
    .id;
  const row = await testEnv.DB.prepare(
    "SELECT user_id FROM project_members WHERE project_id = ?",
  )
    .bind(projectId)
    .first<{ user_id: string }>();
  userId = row!.user_id;
});

const buildApp = () => {
  const app = new Hono<any>();
  app.use("*", async (c, next) => {
    c.set("currentUser", { id: userId });
    await next();
  });
  app.use("*", requireProjectWritable());
  app.all("*", (c) => c.json({ reached: true }));
  return app;
};

const bindings = (
  getProjectEntitlement: () => Promise<unknown>,
  overrides: Record<string, unknown> = {},
) => ({
  DB: testEnv.DB,
  ENTITLEMENT_MODE: "control-plane",
  PROJECT_WRITE_ENFORCEMENT: "true",
  CONTROL_PLANE: { getProjectEntitlement },
  ...overrides,
});

const call = (method: string, path: string, env: Record<string, unknown>) =>
  buildApp().request(path.replace("p1", projectId), { method }, env);

describe("requireProjectWritable", () => {
  it("rejects every write method on a suspended project with a machine-readable code", async () => {
    const env = bindings(async () => entitlement("suspended"));
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await call(method, "/api/projects/p1/stories/1", env);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        code: "PROJECT_SUSPENDED",
      });
    }
  });

  it("covers the programmatic, CLI and api-key mounts", async () => {
    const env = bindings(async () => entitlement("suspended"));
    for (const path of [
      "/programmatic-api/v1/projects/p1/stories",
      "/api-key/v1/projects/p1/artifact-uploads",
      "/api/projects/p1/story-maps/m1/commands",
      "/api/projects/p1/planning-poker/sessions",
    ]) {
      expect((await call("POST", path, env)).status).toBe(403);
    }
  });

  it("keeps reads open for every member", async () => {
    const env = bindings(async () => entitlement("suspended"));
    expect((await call("GET", "/api/projects/p1/stories", env)).status).toBe(
      200,
    );
  });

  it("lets the owner delete a suspended project", async () => {
    const env = bindings(async () => entitlement("suspended"));
    expect((await call("DELETE", "/api/projects/p1", env)).status).toBe(200);
  });

  it.each(["active", "grace"])("allows writes while %s", async (state) => {
    const env = bindings(async () => entitlement(state));
    expect((await call("POST", "/api/projects/p1/stories", env)).status).toBe(
      200,
    );
  });

  it("answers 503 when the state is unknown, but still allows reads", async () => {
    const env = bindings(async () => {
      throw new Error("down");
    });
    const write = await call("POST", "/api/projects/p1/stories", env);
    expect(write.status).toBe(503);
    expect(await write.json()).toMatchObject({
      code: "ENTITLEMENT_UNAVAILABLE",
    });
    expect((await call("GET", "/api/projects/p1/stories", env)).status).toBe(
      200,
    );
  });

  it("does not reveal a project's state to non-members", async () => {
    userId = "someone-else";
    const env = bindings(async () => entitlement("suspended"));
    expect((await call("POST", "/api/projects/p1/stories", env)).status).toBe(
      200,
    );
  });

  it("does nothing when enforcement is off or the deployment is self-hosted", async () => {
    const getProjectEntitlement = vi.fn(async () => entitlement("suspended"));
    for (const overrides of [
      { PROJECT_WRITE_ENFORCEMENT: undefined },
      { ENTITLEMENT_MODE: undefined },
    ]) {
      const env = bindings(getProjectEntitlement, overrides);
      expect((await call("POST", "/api/projects/p1/stories", env)).status).toBe(
        200,
      );
    }
    expect(getProjectEntitlement).not.toHaveBeenCalled();
  });

  it("ignores writes that name no project, such as creation", async () => {
    const env = bindings(async () => entitlement("suspended"));
    expect((await call("POST", "/api/projects", env)).status).toBe(200);
  });
});
