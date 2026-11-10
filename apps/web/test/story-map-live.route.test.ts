import { env, runDurableObjectAlarm, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { createStoryMap } from "../src/application/usecases/manage-story-maps";
import { createDb } from "../src/infrastructure/db/client";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import { D1StoryMapRepository } from "../src/infrastructure/db/repositories/d1-story-map-repository";
import { projectMembersTable } from "../src/infrastructure/db/schema/project-members";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import type { StoryMapServerMessage } from "../src/shared/story-map-live-protocol";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";

type Identity = { sub: string; email: string };

const P1 = "01JNMVQ8Q9Y6P5KH1XZ4V7C2P1";
const P2 = "01JNMVQ8Q9Y6P5KH1XZ4V7C2P2";
const person = (name: string): Identity => ({
  sub: `github|${name}`,
  email: `${name}@example.com`,
});
const OWNER = person("owner");
const MEMBER = person("member");
const VIEWER = person("viewer");
const OUTSIDER = person("outsider");

class Client {
  readonly messages: StoryMapServerMessage[] = [];
  private waiters: (() => void)[] = [];

  constructor(readonly socket: WebSocket) {
    socket.accept();
    socket.addEventListener("message", (event) => {
      this.messages.push(JSON.parse(event.data as string));
      for (const wake of this.waiters.splice(0)) wake();
    });
  }

  send(message: unknown) {
    this.socket.send(JSON.stringify(message));
  }

  command(command: unknown, opId = ulid()) {
    this.send({ type: "command", opId, command });
    return opId;
  }

  async next<T extends StoryMapServerMessage["type"]>(
    type: T,
    where: (m: Extract<StoryMapServerMessage, { type: T }>) => boolean = () =>
      true,
  ): Promise<Extract<StoryMapServerMessage, { type: T }>> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const at = this.messages.findIndex(
        (m) =>
          m.type === type &&
          where(m as Extract<StoryMapServerMessage, { type: T }>),
      );
      if (at !== -1) {
        return this.messages.splice(at, 1)[0] as Extract<
          StoryMapServerMessage,
          { type: T }
        >;
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 25);
      });
    }
    throw new Error(`no ${type} message`);
  }
}

async function connect(
  who: Identity,
  mapId: string,
  projectId = P1,
  origin?: string,
) {
  const headers = new Headers(await createAuthHeaders(who));
  headers.set("Upgrade", "websocket");
  if (origin) headers.set("Origin", origin);
  const response = await SELF.fetch(
    `https://localhost/api/projects/${projectId}/story-maps/${mapId}/live`,
    { headers },
  );
  return response;
}

async function open(who: Identity, mapId: string) {
  const response = await connect(who, mapId);
  expect(response.status).toBe(101);
  return new Client(
    (response as Response & { webSocket: WebSocket }).webSocket,
  );
}

let mapId: string;

describe("story map live editing", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
    for (const who of [OWNER, MEMBER, VIEWER, OUTSIDER]) {
      await createAuthHeaders(who);
    }
    const db = createDb(env.DB);
    await db.insert(projectsTable).values([
      { id: P1, name: "One" },
      { id: P2, name: "Two" },
    ]);
    await db.insert(projectMembersTable).values([
      { projectId: P1, userId: OWNER.sub, role: "owner" },
      { projectId: P1, userId: MEMBER.sub, role: "member" },
      { projectId: P1, userId: VIEWER.sub, role: "viewer" },
      { projectId: P2, userId: OUTSIDER.sub, role: "owner" },
    ]);
    const map = (
      await createStoryMap(
        {
          storyMapRepository: new D1StoryMapRepository(env.DB),
          projectRepository: new D1ProjectRepository(env.DB),
        },
        { projectId: P1, userId: OWNER.sub, title: "Map" },
      )
    )._unsafeUnwrap();
    mapId = map.id;
  });

  it("reflects one client's edit on the other and after a reload", async () => {
    const a = await open(OWNER, mapId);
    const b = await open(MEMBER, mapId);
    const first = await a.next("snapshot");
    await b.next("snapshot");
    expect(first.seq).toBe(0);
    expect(first.role).toBe("owner");

    const opId = a.command({
      type: "addActivity",
      title: "Plan",
      afterActivityId: null,
    });
    const ack = await a.next("ack", (m) => m.opId === opId);
    expect(ack.seq).toBe(1);
    const seenByB = await b.next("applied");
    expect(seenByB.seq).toBe(1);
    expect(seenByB.structure.activities.map((x) => x.title)).toEqual(["Plan"]);

    const reload = await open(VIEWER, mapId);
    const snapshot = await reload.next("snapshot");
    expect(snapshot.seq).toBe(1);
    expect(snapshot.role).toBe("viewer");
    expect(snapshot.structure.activities.map((x) => x.title)).toEqual(["Plan"]);
  });

  it("orders concurrent moves by arrival and keeps both clients equal", async () => {
    const a = await open(OWNER, mapId);
    const b = await open(MEMBER, mapId);
    await a.next("snapshot");
    await b.next("snapshot");
    const ids: string[] = [];
    for (const title of ["X", "Y", "Z"]) {
      const opId = a.command({
        type: "addActivity",
        title,
        afterActivityId: ids.at(-1) ?? null,
      });
      const ack = await a.next("ack", (m) => m.opId === opId);
      ids.push((ack.result as { id: string }).id);
    }
    await b.next("applied", (m) => m.seq === 3);

    const moveA = a.command({
      type: "moveActivity",
      activityId: ids[0],
      afterActivityId: ids[2],
    });
    const moveB = b.command({
      type: "moveActivity",
      activityId: ids[0],
      afterActivityId: null,
    });
    await a.next("ack", (m) => m.opId === moveA);
    await b.next("ack", (m) => m.opId === moveB);
    const lastA = await a.next("applied", (m) => m.seq === 5);
    const lastB = await b.next("applied", (m) => m.seq === 5);
    expect(lastA.structure).toEqual(lastB.structure);
  });

  it("answers a resent opId from the record without applying it twice", async () => {
    const a = await open(OWNER, mapId);
    await a.next("snapshot");
    const opId = a.command({
      type: "addActivity",
      title: "Once",
      afterActivityId: null,
    });
    await a.next("ack", (m) => m.opId === opId);

    const again = await open(OWNER, mapId);
    await again.next("snapshot");
    again.command(
      { type: "addActivity", title: "Once", afterActivityId: null },
      opId,
    );
    const replay = await again.next("ack", (m) => m.opId === opId);
    expect(replay).toMatchObject({ seq: 1, duplicate: true });
    const snapshot = await again.next("snapshot");
    expect(snapshot.seq).toBe(1);
    expect(snapshot.structure.activities).toHaveLength(1);
  });

  it("refuses edits from a viewer but lets the viewer subscribe", async () => {
    const owner = await open(OWNER, mapId);
    const viewer = await open(VIEWER, mapId);
    await owner.next("snapshot");
    await viewer.next("snapshot");

    const denied = viewer.command({
      type: "addActivity",
      title: "No",
      afterActivityId: null,
    });
    expect((await viewer.next("reject", (m) => m.opId === denied)).code).toBe(
      "forbidden",
    );

    owner.command({ type: "addActivity", title: "Yes", afterActivityId: null });
    const seen = await viewer.next("applied");
    expect(seen.structure.activities.map((x) => x.title)).toEqual(["Yes"]);
  });

  it("rejects malformed commands and reports a vanished target with fresh state", async () => {
    const a = await open(OWNER, mapId);
    await a.next("snapshot");
    const bad = a.command({ type: "dropEverything" });
    expect((await a.next("reject", (m) => m.opId === bad)).code).toBe(
      "invalid",
    );
    const gone = a.command({
      type: "renameActivity",
      activityId: "missing",
      title: "x",
    });
    expect((await a.next("reject", (m) => m.opId === gone)).code).toBe(
      "target_gone",
    );
    expect((await a.next("snapshot")).seq).toBe(0);
  });

  it("refuses edits once the map is archived and accepts them after unarchive", async () => {
    const a = await open(OWNER, mapId);
    await a.next("snapshot");
    const archive = a.command({ type: "updateMap", archived: true });
    await a.next("ack", (m) => m.opId === archive);
    const blocked = a.command({
      type: "addActivity",
      title: "late",
      afterActivityId: null,
    });
    expect((await a.next("reject", (m) => m.opId === blocked)).code).toBe(
      "archived",
    );
    const restore = a.command({ type: "updateMap", archived: false });
    await a.next("ack", (m) => m.opId === restore);
  });

  it("denies other projects and missing maps with the same response", async () => {
    const outsider = await connect(OUTSIDER, mapId, P1);
    const missing = await connect(OWNER, "missing-map");
    const wrongProject = await connect(OUTSIDER, mapId, P2);
    for (const response of [outsider, missing, wrongProject]) {
      expect(response.status).toBe(404);
    }
    expect(await outsider.text()).toBe(await missing.text());
  });

  it("rejects a cross-origin handshake", async () => {
    const response = await connect(
      OWNER,
      mapId,
      P1,
      "https://evil.example.com",
    );
    expect(response.status).toBe(403);
  });

  it("closes the subscription when the membership is revoked at the next check", async () => {
    const viewer = await open(VIEWER, mapId);
    await viewer.next("snapshot");
    await createDb(env.DB)
      .delete(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.userId, VIEWER.sub),
          eq(projectMembersTable.projectId, P1),
        ),
      );
    const stub = env.STORY_MAP_DO.get(env.STORY_MAP_DO.idFromName(mapId));
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    for (let i = 0; i < 40 && viewer.socket.readyState === 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(viewer.socket.readyState).not.toBe(1);
  });
});
