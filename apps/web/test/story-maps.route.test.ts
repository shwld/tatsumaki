import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { createDb } from "../src/infrastructure/db/client";
import { projectMembersTable } from "../src/infrastructure/db/schema/project-members";
import { storiesTable } from "../src/infrastructure/db/schema/stories";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";

type Identity = { sub: string; email: string };

const P1 = "01JNMVQ8Q9Y6P5KH1XZ4V7C2P1";
const person = (name: string): Identity => ({
  sub: `github|${name}`,
  email: `${name}@example.com`,
});
const MEMBER = person("member");
const VIEWER = person("viewer");
const OUTSIDER = person("outsider");

async function call(
  who: Identity,
  method: string,
  path: string,
  body?: unknown,
) {
  const headers = new Headers(await createAuthHeaders(who));
  if (body !== undefined) headers.set("content-type", "application/json");
  return SELF.fetch(`https://localhost/api/projects/${P1}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const command = (who: Identity, mapId: string, cmd: unknown) =>
  call(who, "POST", `/story-maps/${mapId}/commands`, {
    opId: ulid(),
    command: cmd,
  });

describe("story map HTTP API", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
    for (const who of [MEMBER, VIEWER, OUTSIDER]) {
      await createAuthHeaders(who);
    }
    const db = createDb(env.DB);
    await db.insert(projectsTable).values({ id: P1, name: "One" });
    await db.insert(projectMembersTable).values([
      { projectId: P1, userId: MEMBER.sub, role: "member" },
      { projectId: P1, userId: VIEWER.sub, role: "viewer" },
    ]);
  });

  it("creates, lists, edits, archives and restores a map", async () => {
    const created = await call(MEMBER, "POST", "/story-maps", {
      title: "Onboarding",
      achievementGoal: "Reach first story",
    });
    expect(created.status).toBe(201);
    const { storyMap } = (await created.json()) as {
      storyMap: { id: string };
    };

    const detail = (await (
      await call(VIEWER, "GET", `/story-maps/${storyMap.id}`)
    ).json()) as {
      structure: {
        map: { title: string; achievementGoal: string };
      };
    };
    expect(detail.structure.map.achievementGoal).toBe("Reach first story");

    const edit = await command(MEMBER, storyMap.id, {
      type: "updateMap",
      title: "Renamed",
    });
    expect(edit.status).toBe(200);
    const archive = await command(MEMBER, storyMap.id, {
      type: "updateMap",
      archived: true,
    });
    expect(archive.status).toBe(200);

    const active = (await (
      await call(MEMBER, "GET", "/story-maps")
    ).json()) as {
      storyMaps: unknown[];
    };
    expect(active.storyMaps).toHaveLength(0);
    const all = (await (
      await call(MEMBER, "GET", "/story-maps?includeArchived=true")
    ).json()) as { storyMaps: { title: string; archivedAt: string | null }[] };
    expect(all.storyMaps[0]?.title).toBe("Renamed");
    expect(all.storyMaps[0]?.archivedAt).not.toBeNull();

    const blocked = await command(MEMBER, storyMap.id, {
      type: "updateMap",
      title: "While archived",
    });
    expect(blocked.status).toBe(409);

    const restore = await command(MEMBER, storyMap.id, {
      type: "updateMap",
      archived: false,
    });
    expect(restore.status).toBe(200);
    const after = (await (await call(MEMBER, "GET", "/story-maps")).json()) as {
      storyMaps: unknown[];
    };
    expect(after.storyMaps).toHaveLength(1);
  });

  it("does not let a viewer create or edit", async () => {
    expect(
      (await call(VIEWER, "POST", "/story-maps", { title: "No" })).status,
    ).toBe(403);
    const created = (await (
      await call(MEMBER, "POST", "/story-maps", { title: "Yes" })
    ).json()) as { storyMap: { id: string } };
    const edit = await command(VIEWER, created.storyMap.id, {
      type: "updateMap",
      title: "No",
    });
    expect(edit.status).toBe(403);
  });

  it("rejects invalid input and hides the map from non-members", async () => {
    expect(
      (await call(MEMBER, "POST", "/story-maps", { title: "  " })).status,
    ).toBe(400);
    expect((await call(MEMBER, "POST", "/story-maps", {})).status).toBe(400);
    const created = (await (
      await call(MEMBER, "POST", "/story-maps", { title: "Secret" })
    ).json()) as { storyMap: { id: string } };
    expect((await call(OUTSIDER, "GET", "/story-maps")).status).toBe(403);
    expect(
      (await command(OUTSIDER, created.storyMap.id, { type: "updateMap" }))
        .status,
    ).toBe(404);
  });

  it("creates a story from a card once per opId and searches stories", async () => {
    const created = (await (
      await call(MEMBER, "POST", "/story-maps", { title: "Link" })
    ).json()) as { storyMap: { id: string } };
    const mapId = created.storyMap.id;
    const act = await command(MEMBER, mapId, {
      type: "addActivity",
      title: "A",
      afterActivityId: null,
    });
    const activityId = ((await act.json()) as { result: { id: string } }).result
      .id;
    const taskRes = await command(MEMBER, mapId, {
      type: "addTask",
      activityId,
      title: "T",
      afterTaskId: null,
    });
    const taskId = ((await taskRes.json()) as { result: { id: string } }).result
      .id;
    const cardRes = await command(MEMBER, mapId, {
      type: "addCard",
      taskId,
      sliceId: null,
      afterCardId: null,
      ideaTitle: "Idea",
    });
    const cardId = ((await cardRes.json()) as { result: { id: string } }).result
      .id;

    const sliceRes = await command(MEMBER, mapId, {
      type: "addSlice",
      title: "MVP",
      afterSliceId: null,
    });
    const sliceId = ((await sliceRes.json()) as { result: { id: string } })
      .result.id;
    expect(
      (
        await command(MEMBER, mapId, {
          type: "moveCard",
          cardId,
          taskId,
          sliceId,
          afterCardId: null,
        })
      ).status,
    ).toBe(200);

    const opId = ulid();
    const body = {
      opId,
      command: {
        type: "createStoryFromCard",
        cardId,
        title: "Made",
        description: "d",
        storyType: "feature",
        isIcebox: false,
      },
    };
    const first = await call(
      MEMBER,
      "POST",
      `/story-maps/${mapId}/commands`,
      body,
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      result: { storyId: string; storyNumber: number };
      duplicate: boolean;
    };
    expect(firstBody.duplicate).toBe(false);
    const retry = await call(
      MEMBER,
      "POST",
      `/story-maps/${mapId}/commands`,
      body,
    );
    const retryBody = (await retry.json()) as typeof firstBody;
    expect(retryBody.duplicate).toBe(true);
    expect(retryBody.result).toEqual(firstBody.result);
    const stories = await createDb(env.DB).select().from(storiesTable);
    expect(stories).toHaveLength(1);

    const reloaded = (await (
      await call(MEMBER, "GET", `/story-maps/${mapId}`)
    ).json()) as {
      structure: {
        cards: {
          sliceId: string | null;
          storyState: string;
          story: { number: number; title: string; status: string } | null;
        }[];
      };
    };
    expect(reloaded.structure.cards).toMatchObject([
      {
        sliceId,
        storyState: "linked",
        story: { number: 1, title: "Made", status: "Unstarted" },
      },
    ]);
    expect(stories[0]).toMatchObject({
      status: "Unstarted",
      iterationId: null,
      isIcebox: 0,
    });

    const search = await call(
      MEMBER,
      "GET",
      `/story-maps/${mapId}/story-search?q=Made`,
    );
    const found = (await search.json()) as {
      stories: { number: number; placed: boolean }[];
    };
    expect(found.stories).toMatchObject([{ number: 1, placed: true }]);
    expect(
      (await call(VIEWER, "GET", `/story-maps/${mapId}/story-search?q=`))
        .status,
    ).toBe(403);
  });
});

describe("story map HTTP command limits", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
    await createAuthHeaders(MEMBER);
    const db = createDb(env.DB);
    await db.insert(projectsTable).values({ id: P1, name: "One" });
    await db
      .insert(projectMembersTable)
      .values({ projectId: P1, userId: MEMBER.sub, role: "member" });
  });

  it("refuses an oversized body and throttles a burst", async () => {
    const created = (await (
      await call(MEMBER, "POST", "/story-maps", { title: "Limits" })
    ).json()) as { storyMap: { id: string } };
    const big = await call(
      MEMBER,
      "POST",
      `/story-maps/${created.storyMap.id}/commands`,
      {
        opId: ulid(),
        command: { type: "updateMap", title: "x".repeat(70 * 1024) },
      },
    );
    expect(big.status).toBe(413);
    expect(await big.json()).toMatchObject({ code: "invalid" });

    const responses = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        command(MEMBER, created.storyMap.id, {
          type: "updateMap",
          title: `T${i}`,
        }),
      ),
    );
    const statuses = responses.map((response) => response.status);
    expect(statuses).toContain(429);
  });
});
