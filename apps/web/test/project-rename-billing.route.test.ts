import { env } from "cloudflare:test";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import type { Bindings, Env } from "../src/index";
import type { CurrentUser } from "../src/presentation/middleware/access-auth";
import { projectsRoute } from "../src/presentation/routes/projects";
import { resetDatabase } from "./helpers/db";

const createProject = async (name: string, ownerUserId: string) => {
  const result = await new D1ProjectRepository(env.DB).create({
    name,
    ownerUserId,
  });
  if (result.isErr()) throw new Error("seed failed");
  return result.value.id;
};

const rename = (
  userId: string,
  projectId: string,
  name: string,
  bindings: Partial<Bindings>,
) => {
  const app = new Hono<Env>();
  app.use(async (c, next) => {
    c.set("currentUser", { id: userId } as CurrentUser);
    await next();
  });
  app.route("/", projectsRoute);
  return app.request(
    `https://tatsumaki.example/projects/${projectId}/settings`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    },
    { DB: env.DB, ...bindings } as Bindings,
  );
};

const controlPlane = (syncProjectDisplayNames: ReturnType<typeof vi.fn>) =>
  ({
    ENTITLEMENT_MODE: "control-plane",
    CONTROL_PLANE: { syncProjectDisplayNames },
  }) as unknown as Partial<Bindings>;

describe("project rename and subscription display name", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("syncs the new name to the subscription display name", async () => {
    const projectId = await createProject("Old", "owner");
    const sync = vi.fn(async () => ({ updatedSubscriptionCount: 1 }));

    const response = await rename(
      "owner",
      projectId,
      "New",
      controlPlane(sync),
    );

    expect(response.status).toBe(200);
    expect(sync).toHaveBeenCalledWith({
      billingAccountId: "owner",
      projects: [{ projectId, name: "New" }],
    });
  });

  it("keeps the rename when the sync fails", async () => {
    const projectId = await createProject("Old", "owner");
    const sync = vi.fn(async () => {
      throw new Error("control plane down");
    });

    const response = await rename(
      "owner",
      projectId,
      "New",
      controlPlane(sync),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ project: { name: "New" } });
  });

  it("does not call billing when the name is unchanged or self-hosted", async () => {
    const projectId = await createProject("Same", "owner");
    const sync = vi.fn();

    await rename("owner", projectId, "Same", controlPlane(sync));
    const selfHosted = await rename("owner", projectId, "Other", {});

    expect(sync).not.toHaveBeenCalled();
    expect(selfHosted.status).toBe(200);
  });
});
