import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { listEpicProgress } from "../src/application/usecases/manage-epics";
import { deriveEpicProgress } from "../src/domain/entities/epic-progress";
import { D1EpicRepository } from "../src/infrastructure/db/repositories/d1-epic-repository";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { issueAccessToken } from "./helpers/cli-auth";
import { resetDatabase } from "./helpers/db";

type Counts = {
  total: number;
  accepted: number;
  inProgress: number;
  unstarted: number;
  icebox: number;
  blocked: number;
};
type ProgressPayload = {
  state: string;
  storyCompletionRate: number | null;
  stories: Counts;
  pointCompletionRate: number | null;
  points: {
    estimatedPoints: number;
    acceptedPoints: number;
    excludedStories: number;
  };
  overdue: boolean;
};
type ListPayload = {
  epics: Array<{ epic: { labelName: string }; progress: ProgressPayload }>;
  total: Counts;
};

const OWNER = { sub: "github|test-user", email: "tester@example.com" };
const OUTSIDER = { sub: "github|outsider", email: "outsider@example.com" };

type StoryInput = {
  status?: string;
  icebox?: boolean;
  type?: string;
  point?: number | null;
  archived?: boolean;
};

describe("epic progress", () => {
  let projectId: string;
  let token: string;
  let storySeq = 0;

  const api = (path: string) =>
    `https://localhost/programmatic-api/v1/projects/${projectId}${path}`;

  const get = (url: string, as?: string) =>
    SELF.fetch(url, { headers: { authorization: `Bearer ${as ?? token}` } });

  const call = async (method: string, url: string, body?: unknown) => {
    const headers = new Headers(await createAuthHeaders(OWNER));
    if (body !== undefined) headers.set("content-type", "application/json");
    return SELF.fetch(url, {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
    });
  };

  const createLabel = async (name: string) => {
    const response = await call(
      "POST",
      `https://localhost/api/projects/${projectId}/labels`,
      { name, color: "#3b82f6" },
    );
    return ((await response.json()) as { label: { id: string } }).label.id;
  };

  const enable = (labelId: string) =>
    SELF.fetch(api(`/labels/${labelId}/epic/enable`), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: "{}",
    });

  const addStory = async (labelIds: string[], input: StoryInput = {}) => {
    storySeq += 1;
    const id = `story-${storySeq}`;
    await env.DB.prepare(
      `INSERT INTO stories (id, story_number, project_id, title, description, type, status, story_point, is_icebox, archived_at, position)
       VALUES (?1, ?2, ?3, ?4, '', ?5, ?6, ?7, ?8, ?9, ?2)`,
    )
      .bind(
        id,
        storySeq,
        projectId,
        `story ${storySeq}`,
        input.type ?? "feature",
        input.status ?? "Unstarted",
        input.point === undefined ? null : input.point,
        input.icebox ? 1 : 0,
        input.archived ? "2026-01-01T00:00:00.000Z" : null,
      )
      .run();
    for (const labelId of labelIds) {
      await attach(id, labelId);
    }
    return id;
  };

  const attach = (storyId: string, labelId: string) =>
    env.DB.prepare(
      "INSERT INTO story_labels (project_id, story_id, label_id) VALUES (?1, ?2, ?3)",
    )
      .bind(projectId, storyId, labelId)
      .run();

  const progressOf = async (labelId: string) => {
    const response = await get(api(`/labels/${labelId}/epic/progress`));
    expect(response.status).toBe(200);
    return (await response.json()) as {
      progress: ProgressPayload;
      stories: Array<{ storyNumber: number; isBlocked: boolean }>;
    };
  };

  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
    token = await issueAccessToken(OWNER);
    storySeq = 0;
    const response = await call("POST", "https://localhost/api/projects", {
      name: "Progress",
    });
    projectId = ((await response.json()) as { project: { id: string } }).project
      .id;
  });

  it("splits stories into four statuses and keeps Icebox, bugs and chores in the denominator", async () => {
    const label = await createLabel("onboarding");
    await enable(label);
    await addStory([label], { status: "Accepted", point: 2 });
    await addStory([label], { status: "Accepted", type: "chore" });
    await addStory([label], { status: "Started", point: 3 });
    await addStory([label], { status: "Rejected", type: "bug" });
    await addStory([label], { status: "Unstarted", point: 5 });
    await addStory([label], { icebox: true });

    const { progress, stories } = await progressOf(label);

    expect(progress.stories).toEqual({
      total: 6,
      accepted: 2,
      inProgress: 2,
      unstarted: 1,
      icebox: 1,
      blocked: 0,
    });
    expect(progress.storyCompletionRate).toBeCloseTo(2 / 6);
    expect(progress.state).toBe("in_progress");
    expect(stories.map((story) => story.storyNumber)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("measures points only on estimated features and reports what it leaves out", async () => {
    const label = await createLabel("points");
    await enable(label);
    await addStory([label], { status: "Accepted", point: 2 });
    await addStory([label], { status: "Started", point: 6 });
    await addStory([label], { status: "Accepted" });
    await addStory([label], { status: "Accepted", type: "bug", point: 1 });

    const { progress } = await progressOf(label);

    expect(progress.points).toEqual({
      estimatedPoints: 8,
      acceptedPoints: 2,
      excludedStories: 2,
    });
    expect(progress.pointCompletionRate).toBe(0.25);
  });

  it("has no rate for zero stories or zero estimated points", async () => {
    const label = await createLabel("empty");
    await enable(label);

    const empty = (await progressOf(label)).progress;
    expect(empty).toMatchObject({
      state: "no_stories",
      storyCompletionRate: null,
      pointCompletionRate: null,
    });
    expect(empty.points.excludedStories).toBe(0);

    await addStory([label], { archived: true });
    expect((await progressOf(label)).progress.points.excludedStories).toBe(0);

    await addStory([label]);
    const unestimated = (await progressOf(label)).progress;
    expect(unestimated).toMatchObject({
      state: "not_started",
      storyCompletionRate: 0,
      pointCompletionRate: null,
    });
  });

  it("reports completed once every story, Icebox included, is accepted", async () => {
    const label = await createLabel("done");
    await enable(label);
    const first = await addStory([label], { status: "Accepted" });
    await addStory([label], { icebox: true });
    expect((await progressOf(label)).progress.state).toBe("in_progress");

    await env.DB.prepare(
      "UPDATE stories SET status = 'Accepted', is_icebox = 0 WHERE id != ?1",
    )
      .bind(first)
      .run();
    expect((await progressOf(label)).progress).toMatchObject({
      state: "completed",
      storyCompletionRate: 1,
    });
  });

  it("counts a shared story in each epic and once across epics", async () => {
    const a = await createLabel("a");
    const b = await createLabel("b");
    await enable(a);
    await enable(b);
    await addStory([a, b], { status: "Accepted" });
    await addStory([a], { status: "Started" });

    const response = await get(api("/epics/progress"));
    const body = (await response.json()) as ListPayload;

    const byName = Object.fromEntries(
      body.epics.map((item) => [item.epic.labelName, item.progress.stories]),
    );
    expect(byName.a).toMatchObject({ total: 2, accepted: 1, inProgress: 1 });
    expect(byName.b).toMatchObject({ total: 1, accepted: 1 });
    expect(body.total).toMatchObject({ total: 2, accepted: 1, inProgress: 1 });
  });

  it("follows label changes, archiving and blockers", async () => {
    const label = await createLabel("live");
    await enable(label);
    const story = await addStory([label], { status: "Started" });
    const blocker = await addStory([], { status: "Started" });
    await addStory([label], { archived: true });
    await env.DB.prepare(
      "INSERT INTO story_blockers (id, blocking_story_id, blocked_story_id) VALUES ('b1', ?1, ?2)",
    )
      .bind(blocker, story)
      .run();

    const blocked = await progressOf(label);
    expect(blocked.progress.stories).toMatchObject({ total: 1, blocked: 1 });
    expect(blocked.stories[0]?.isBlocked).toBe(true);

    await env.DB.prepare("UPDATE stories SET status = 'Accepted' WHERE id = ?1")
      .bind(blocker)
      .run();
    expect((await progressOf(label)).progress.stories.blocked).toBe(0);

    await env.DB.prepare("DELETE FROM story_labels WHERE story_id = ?1")
      .bind(story)
      .run();
    expect((await progressOf(label)).progress.state).toBe("no_stories");
  });

  it("hides epics with planning off and recounts when planning is turned on again", async () => {
    const label = await createLabel("toggle");
    const enabled = await enable(label);
    const { epic } = (await enabled.json()) as { epic: { revision: number } };
    await addStory([label], { status: "Accepted" });

    await SELF.fetch(api(`/labels/${label}/epic/disable`), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ revision: epic.revision }),
    });

    const list = (await (
      await get(api("/epics/progress"))
    ).json()) as ListPayload;
    expect(list.epics).toEqual([]);
    expect(list.total.total).toBe(0);
    const off = await get(api(`/labels/${label}/epic/progress`));
    expect(off.status).toBe(404);
    expect(await off.json()).toMatchObject({ code: "EPIC_PLANNING_OFF" });

    await addStory([label], { status: "Started" });
    await SELF.fetch(api(`/labels/${label}/epic/enable`), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ revision: epic.revision + 1 }),
    });
    expect((await progressOf(label)).progress.stories).toMatchObject({
      total: 2,
      accepted: 1,
    });
  });

  it("returns 404 for a label whose planning was never turned on and 403 to non-members", async () => {
    const label = await createLabel("plain");
    const missing = await get(api(`/labels/${label}/epic/progress`));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "EPIC_NOT_FOUND" });

    const outsider = await issueAccessToken(OUTSIDER);
    expect((await get(api("/epics/progress"), outsider)).status).toBe(403);
  });

  it("does not run more queries as epics grow", async () => {
    const queriesFor = async (epicCount: number) => {
      await resetDatabase(env.DB);
      const response = await call("POST", "https://localhost/api/projects", {
        name: "Many",
      });
      projectId = ((await response.json()) as { project: { id: string } })
        .project.id;
      for (let index = 0; index < epicCount; index += 1) {
        const label = await createLabel(`epic-${index}`);
        await enable(label);
        await addStory([label], { status: "Started" });
      }
      let prepared = 0;
      const counting = new Proxy(env.DB, {
        get(target, property) {
          const value = Reflect.get(target, property) as unknown;
          if (property === "prepare") {
            return (...args: [string]) => {
              prepared += 1;
              return target.prepare(...args);
            };
          }
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const result = await listEpicProgress(
        { epicRepository: new D1EpicRepository(counting) },
        { projectId, today: "2026-11-08" },
      );
      expect(result._unsafeUnwrap().epics).toHaveLength(epicCount);
      return prepared;
    };

    const few = await queriesFor(2);
    const many = await queriesFor(7);
    expect(many).toBe(few);
  });

  it("serves progress over MCP", async () => {
    const label = await createLabel("mcp");
    await enable(label);
    await addStory([label], { status: "Accepted" });
    const mcpToken = await issueAccessToken(
      OWNER,
      "https://localhost/programmatic-api/mcp",
    );
    const response = await SELF.fetch(
      "https://localhost/programmatic-api/mcp",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${mcpToken}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-03-26",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_epic_progress", arguments: { projectId } },
        }),
      },
    );
    const raw = await response.text();
    const data = raw.includes("data: ")
      ? raw
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .map((line) => line.slice(6))
          .join("\n")
      : raw;
    const result = (
      JSON.parse(data) as { result: { content: Array<{ text: string }> } }
    ).result;
    const body = JSON.parse(result.content[0]?.text ?? "{}") as ListPayload;
    expect(body.epics[0]?.progress.stories).toMatchObject({
      total: 1,
      accepted: 1,
    });
  });
});

describe("deriveEpicProgress overdue", () => {
  const aggregate = (accepted: number, total: number) => ({
    total,
    accepted,
    inProgress: total - accepted,
    unstarted: 0,
    icebox: 0,
    blocked: 0,
    estimatedPoints: 0,
    acceptedPoints: 0,
    excludedStories: 0,
  });

  it("is overdue only after the planned end while a story is not accepted", () => {
    const epic = { plannedEnd: "2026-11-08" };
    expect(
      deriveEpicProgress(epic, aggregate(1, 2), "2026-11-08").overdue,
    ).toBe(false);
    expect(
      deriveEpicProgress(epic, aggregate(1, 2), "2026-11-09").overdue,
    ).toBe(true);
    expect(
      deriveEpicProgress(epic, aggregate(2, 2), "2026-11-09").overdue,
    ).toBe(false);
    expect(
      deriveEpicProgress({ plannedEnd: null }, aggregate(0, 2), "2030-01-01")
        .overdue,
    ).toBe(false);
    expect(
      deriveEpicProgress(epic, aggregate(0, 0), "2026-11-09").overdue,
    ).toBe(false);
  });
});
