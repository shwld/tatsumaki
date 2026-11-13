import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { issueAccessToken } from "./helpers/cli-auth";
import { resetDatabase } from "./helpers/db";

type Identity = { sub: string; email: string };

const OWNER: Identity = {
  sub: "github|test-user",
  email: "tester@example.com",
};
const VIEWER: Identity = { sub: "github|viewer", email: "viewer@example.com" };

describe("story map programmatic API (tm story-map)", () => {
  let projectId: string;

  const call = async (
    method: string,
    path: string,
    options: { as?: Identity; body?: unknown } = {},
  ) => {
    const identity = options.as ?? OWNER;
    const headers = new Headers({
      authorization: `Bearer ${await issueAccessToken(identity)}`,
    });
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    return SELF.fetch(
      `https://localhost/programmatic-api/v1/projects/${projectId}${path}`,
      {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : null,
      },
    );
  };

  const command = (mapId: string, body: unknown, as?: Identity) =>
    call("POST", `/story-maps/${mapId}/commands`, {
      as,
      body: { opId: ulid(), command: body },
    });

  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
    const created = await SELF.fetch("https://localhost/api/projects", {
      method: "POST",
      headers: {
        ...(await createAuthHeaders(OWNER)),
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Maps" }),
    });
    projectId = ((await created.json()) as { project: { id: string } }).project
      .id;
    await createAuthHeaders(VIEWER);
    await SELF.fetch("https://localhost/api/auth/me", {
      headers: await createAuthHeaders(VIEWER),
    });
    await new D1ProjectRepository(env.DB).upsertMember({
      projectId,
      userId: VIEWER.sub,
      role: "viewer",
    });
  });

  it("builds a map with the CLI endpoints and reads the IDs back", async () => {
    const created = await call("POST", "/story-maps", {
      body: { title: "Onboarding" },
    });
    expect(created.status).toBe(201);
    const mapId = ((await created.json()) as { storyMap: { id: string } })
      .storyMap.id;

    const activity = await command(mapId, {
      type: "addActivity",
      title: "Sign up",
      afterActivityId: null,
    });
    expect(activity.status).toBe(200);
    const activityId = ((await activity.json()) as { result: { id: string } })
      .result.id;

    const task = await command(mapId, {
      type: "addTask",
      activityId,
      title: "Enter email",
      afterTaskId: null,
    });
    expect(task.status).toBe(200);

    const read = await call("GET", `/story-maps/${mapId}`);
    const body = (await read.json()) as {
      structure: {
        activities: { id: string; title: string }[];
        tasks: { activityId: string }[];
      };
    };
    expect(body.structure.activities).toMatchObject([
      { id: activityId, title: "Sign up" },
    ]);
    expect(body.structure.tasks).toMatchObject([{ activityId }]);

    const list = await call("GET", "/story-maps");
    expect(
      ((await list.json()) as { storyMaps: unknown[] }).storyMaps,
    ).toHaveLength(1);
  });

  it("rejects viewers, archived maps and unknown IDs with distinguishable codes", async () => {
    const created = await call("POST", "/story-maps", {
      body: { title: "Locked" },
    });
    const mapId = ((await created.json()) as { storyMap: { id: string } })
      .storyMap.id;

    const viewer = await command(
      mapId,
      { type: "addSlice", title: "S", afterSliceId: null },
      VIEWER,
    );
    expect(viewer.status).toBe(403);
    expect(await viewer.json()).toEqual({ code: "forbidden" });

    const gone = await command(mapId, {
      type: "renameActivity",
      activityId: "missing",
      title: "x",
    });
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ code: "target_gone" });

    await command(mapId, { type: "updateMap", archived: true });
    const archived = await command(mapId, {
      type: "addSlice",
      title: "S",
      afterSliceId: null,
    });
    expect(archived.status).toBe(409);
    expect(await archived.json()).toEqual({ code: "archived" });

    const restored = await command(mapId, {
      type: "updateMap",
      archived: false,
    });
    expect(restored.status).toBe(200);
  });
});
