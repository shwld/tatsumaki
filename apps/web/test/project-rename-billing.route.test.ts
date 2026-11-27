import { env } from "cloudflare:test";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import type { Bindings, Env } from "../src/index";
import type { CurrentUser } from "../src/presentation/middleware/access-auth";
import { projectsRoute } from "../src/presentation/routes/projects";
import { resetDatabase } from "./helpers/db";
import { D1ProjectNameNotifications } from "../src/infrastructure/db/repositories/d1-project-name-notifications";
import { notifyProjectRenames } from "../src/application/usecases/notify-project-renames";

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

describe("project rename notifications", () => {
  beforeEach(async () => resetDatabase(env.DB));
  it("records a rename and retries its notification after provider failure", async () => {
    const projectId = await createProject("Old", "owner");
    expect((await rename("owner", projectId, "New", {})).status).toBe(200);
    const notifications = new D1ProjectNameNotifications(env.DB);
    expect(await notifications.listPending(10)).toEqual([
      { projectId, name: "New", revision: 1 },
    ]);
    const recordRenamed = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(undefined);
    await notifyProjectRenames({ notifications, provider: { recordRenamed } });
    expect(await notifications.listPending(10)).toHaveLength(1);
    await notifyProjectRenames({ notifications, provider: { recordRenamed } });
    expect(await notifications.listPending(10)).toHaveLength(0);
  });
  it("keeps a newer rename pending when an older event is acknowledged", async () => {
    const projectId = await createProject("Old", "owner");
    await rename("owner", projectId, "First", {});
    const notifications = new D1ProjectNameNotifications(env.DB);
    const first = (await notifications.listPending(10))[0];
    await rename("owner", projectId, "Second", {});
    await notifications.markDelivered(first);
    expect(await notifications.listPending(10)).toEqual([
      { projectId, name: "Second", revision: 2 },
    ]);
  });
  it("does not record an unchanged name", async () => {
    const projectId = await createProject("Same", "owner");
    await rename("owner", projectId, "Same", {});
    expect(
      await new D1ProjectNameNotifications(env.DB).listPending(10),
    ).toHaveLength(0);
  });
});
