import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { issueAccessToken } from "./helpers/cli-auth";
import { resetDatabase } from "./helpers/db";

type Identity = { sub: string; email: string };
type EpicPayload = {
  id: string;
  labelId: string;
  labelName: string;
  enabled: boolean;
  description: string;
  successCriteria: string;
  ownerId: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  outcomeStatus: string;
  revision: number;
};

const OWNER: Identity = {
  sub: "github|test-user",
  email: "tester@example.com",
};
const MEMBER: Identity = { sub: "github|member", email: "member@example.com" };
const VIEWER: Identity = { sub: "github|viewer", email: "viewer@example.com" };
const OUTSIDER: Identity = {
  sub: "github|outsider",
  email: "outsider@example.com",
};

describe("label strategy planning (epics)", () => {
  const tokens: Record<string, string> = {};
  let projectId: string;

  const call = async (
    method: string,
    url: string,
    options: { as?: Identity; body?: unknown } = {},
  ) => {
    const identity = options.as ?? OWNER;
    const headers = new Headers();
    if (url.includes("/programmatic-api/")) {
      tokens[identity.sub] ??= await issueAccessToken(identity);
      headers.set("authorization", `Bearer ${tokens[identity.sub]}`);
    } else {
      for (const [key, value] of Object.entries(
        await createAuthHeaders(identity),
      )) {
        headers.set(key, value);
      }
    }
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    return SELF.fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : null,
    });
  };

  const api = (path: string) =>
    `https://localhost/programmatic-api/v1/projects/${projectId}${path}`;
  const web = (path: string) =>
    `https://localhost/api/projects/${projectId}${path}`;

  const json = async <T>(response: Response) => (await response.json()) as T;

  const createProject = async (as: Identity = OWNER) => {
    const response = await call("POST", "https://localhost/api/projects", {
      as,
      body: { name: "Planning" },
    });
    return (await json<{ project: { id: string } }>(response)).project.id;
  };

  const createLabel = async (name: string, project = projectId) => {
    const response = await call(
      "POST",
      `https://localhost/api/projects/${project}/labels`,
      { body: { name, color: "#3b82f6" } },
    );
    return (await json<{ label: { id: string } }>(response)).label.id;
  };

  const addMember = async (identity: Identity, role: "member" | "viewer") => {
    await createAuthHeaders(identity);
    await call("GET", "https://localhost/api/auth/me", { as: identity });
    await new D1ProjectRepository(env.DB).upsertMember({
      projectId,
      userId: identity.sub,
      role,
    });
  };

  const enable = (labelId: string, body?: unknown, as?: Identity) =>
    call("POST", api(`/labels/${labelId}/epic/enable`), { body, as });
  const disable = (labelId: string, revision: number, as?: Identity) =>
    call("POST", api(`/labels/${labelId}/epic/disable`), {
      body: { revision },
      as,
    });
  const updatePlan = (labelId: string, body: unknown, as?: Identity) =>
    call("PATCH", api(`/labels/${labelId}/epic`), { body, as });
  const epicOf = async (response: Response) =>
    (await json<{ epic: EpicPayload }>(response)).epic;

  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
    for (const key of Object.keys(tokens)) delete tokens[key];
    projectId = await createProject();
  });

  it("lists labels with IDs for the CLI", async () => {
    const labelId = await createLabel("onboarding");

    const response = await call("GET", api("/labels"));

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      labels: [{ id: labelId, name: "onboarding", color: "#3b82f6" }],
    });
  });

  it("turns planning on, saves the plan, and restores it after turning off and on", async () => {
    const labelId = await createLabel("onboarding");
    await addMember(MEMBER, "member");

    const enabled = await enable(labelId);
    expect(enabled.status).toBe(200);
    const created = await epicOf(enabled);
    expect(created).toMatchObject({
      labelId,
      labelName: "onboarding",
      enabled: true,
      description: "",
      plannedStart: null,
      outcomeStatus: "unevaluated",
      revision: 1,
    });

    const saved = await updatePlan(labelId, {
      revision: 1,
      description: "  Make the first week easy  ",
      successCriteria: "80% finish setup",
      ownerId: MEMBER.sub,
      plannedStart: "2026-11-01",
      plannedEnd: "2026-12-31",
      outcomeStatus: "achieved",
    });
    expect(saved.status).toBe(200);
    const plan = {
      description: "Make the first week easy",
      successCriteria: "80% finish setup",
      ownerId: MEMBER.sub,
      plannedStart: "2026-11-01",
      plannedEnd: "2026-12-31",
      outcomeStatus: "achieved",
    };
    expect(await epicOf(saved)).toMatchObject({ ...plan, revision: 2 });

    const off = await disable(labelId, 2);
    expect(off.status).toBe(200);
    expect(await epicOf(off)).toMatchObject({
      ...plan,
      enabled: false,
      revision: 3,
    });

    const withoutRevision = await enable(labelId);
    expect(withoutRevision.status).toBe(409);
    expect(await json(withoutRevision)).toMatchObject({
      code: "REVISION_REQUIRED",
    });

    const on = await enable(labelId, { revision: 3 });
    expect(on.status).toBe(200);
    expect(await epicOf(on)).toMatchObject({
      ...plan,
      id: created.id,
      enabled: true,
      revision: 4,
    });

    const read = await call("GET", api(`/labels/${labelId}/epic`));
    expect(await epicOf(read)).toMatchObject({ ...plan, revision: 4 });
  });

  it("creates only one epic when planning is turned on concurrently", async () => {
    const labelId = await createLabel("onboarding");
    tokens[OWNER.sub] = await issueAccessToken(OWNER);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => enable(labelId)),
    );

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200, 200, 200,
    ]);
    const ids = new Set(
      await Promise.all(responses.map(async (r) => (await epicOf(r)).id)),
    );
    expect(ids.size).toBe(1);
    const listed = await json<{ epics: EpicPayload[] }>(
      await call("GET", api("/epics")),
    );
    expect(listed.epics).toHaveLength(1);
  });

  it("rejects writes with a stale revision", async () => {
    const labelId = await createLabel("onboarding");
    await enable(labelId);
    await updatePlan(labelId, { revision: 1, description: "first" });

    const stale = await updatePlan(labelId, { revision: 1, description: "x" });
    expect(stale.status).toBe(409);
    expect(await json(stale)).toMatchObject({ code: "REVISION_CONFLICT" });

    const staleOff = await disable(labelId, 1);
    expect(staleOff.status).toBe(409);

    const read = await epicOf(
      await call("GET", api(`/labels/${labelId}/epic`)),
    );
    expect(read).toMatchObject({ description: "first", enabled: true });
  });

  it("validates the planned period", async () => {
    const labelId = await createLabel("onboarding");
    await enable(labelId);

    const cases: Array<[unknown, string | null]> = [
      [{ plannedStart: "2026-11-01" }, null],
      [{ plannedStart: "2026-11-01", plannedEnd: null }, null],
      [
        { plannedStart: "2026-12-01", plannedEnd: "2026-11-01" },
        "INVALID_PLANNED_PERIOD",
      ],
      [
        { plannedStart: "2026-02-30", plannedEnd: "2026-03-01" },
        "INVALID_PLANNED_PERIOD",
      ],
      [
        { plannedStart: "2026-11-01T00:00:00Z", plannedEnd: "2026-11-02" },
        "INVALID_PLANNED_PERIOD",
      ],
    ];
    for (const [period, code] of cases) {
      const response = await updatePlan(labelId, {
        revision: 1,
        ...(period as object),
      });
      expect(response.status).toBe(400);
      if (code) expect(await json(response)).toMatchObject({ code });
    }

    const sameDay = await updatePlan(labelId, {
      revision: 1,
      plannedStart: "2026-11-01",
      plannedEnd: "2026-11-01",
    });
    expect(sameDay.status).toBe(200);

    const cleared = await updatePlan(labelId, {
      revision: 2,
      plannedStart: null,
      plannedEnd: null,
    });
    expect(await epicOf(cleared)).toMatchObject({
      plannedStart: null,
      plannedEnd: null,
    });
  });

  it("rejects an owner who is not a project member and an unknown outcome", async () => {
    const labelId = await createLabel("onboarding");
    await enable(labelId);

    const owner = await updatePlan(labelId, {
      revision: 1,
      ownerId: OUTSIDER.sub,
    });
    expect(owner.status).toBe(400);
    expect(await json(owner)).toMatchObject({ code: "INVALID_OWNER" });

    const outcome = await updatePlan(labelId, {
      revision: 1,
      outcomeStatus: "done",
    });
    expect(outcome.status).toBe(400);
    expect(await json(outcome)).toMatchObject({
      code: "INVALID_OUTCOME_STATUS",
    });
  });

  it("lets viewers read but not change planning", async () => {
    const labelId = await createLabel("onboarding");
    await enable(labelId);
    await addMember(VIEWER, "viewer");

    expect(
      (await call("GET", api(`/labels/${labelId}/epic`), { as: VIEWER }))
        .status,
    ).toBe(200);
    expect((await call("GET", api("/epics"), { as: VIEWER })).status).toBe(200);
    for (const response of [
      await enable(labelId, { revision: 1 }, VIEWER),
      await disable(labelId, 1, VIEWER),
      await updatePlan(labelId, { revision: 1, description: "x" }, VIEWER),
    ]) {
      expect(response.status).toBe(403);
      expect(await json(response)).toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("rejects labels of another project and non-members", async () => {
    const otherProject = await createProject();
    const foreignLabel = await createLabel("foreign", otherProject);

    const response = await enable(foreignLabel);
    expect(response.status).toBe(404);
    expect(await json(response)).toMatchObject({ code: "LABEL_NOT_FOUND" });
    const listed = await json<{ epics: EpicPayload[] }>(
      await call(
        "GET",
        `https://localhost/programmatic-api/v1/projects/${otherProject}/epics`,
      ),
    );
    expect(listed.epics).toEqual([]);

    const ownLabel = await createLabel("own");
    expect((await enable(ownLabel, undefined, OUTSIDER)).status).toBe(403);
    expect(
      (await call("GET", api(`/labels/${ownLabel}/epic`), { as: OUTSIDER }))
        .status,
    ).toBe(403);
  });

  it("reports what deleting a label removes, and deleting it removes the epic", async () => {
    const labelId = await createLabel("onboarding");
    for (const title of ["one", "two"]) {
      await call("POST", web("/stories"), {
        body: { title, labelIds: [labelId] },
      });
    }

    const before = await call("GET", api(`/labels/${labelId}/deletion-impact`));
    expect(await json(before)).toEqual({
      labelId,
      labelName: "onboarding",
      storyCount: 2,
      epic: null,
    });

    await enable(labelId);
    await updatePlan(labelId, { revision: 1, successCriteria: "done" });
    const withPlan = await call(
      "GET",
      api(`/labels/${labelId}/deletion-impact`),
    );
    expect(await json(withPlan)).toMatchObject({
      storyCount: 2,
      epic: { enabled: true, hasPlan: true },
    });

    await call("DELETE", web(`/labels/${labelId}`));
    const listed = await json<{ epics: EpicPayload[] }>(
      await call("GET", api("/epics")),
    );
    expect(listed.epics).toEqual([]);
  });

  it("serves the same operations on the Web API", async () => {
    const labelId = await createLabel("onboarding");

    const response = await call("POST", web(`/labels/${labelId}/epic/enable`));

    expect(response.status).toBe(200);
    expect(await epicOf(response)).toMatchObject({ labelId, enabled: true });
    const listed = await json<{ epics: EpicPayload[] }>(
      await call("GET", web("/epics")),
    );
    expect(listed.epics.map((epic) => epic.labelName)).toEqual(["onboarding"]);
  });

  it("rejects epicId on story writes with guidance to use labels", async () => {
    const created = await json<{ story: { storyNumber: number } }>(
      await call("POST", web("/stories"), { body: { title: "Story" } }),
    );

    const response = await call(
      "PATCH",
      api(`/stories/${created.story.storyNumber}`),
      { body: { epicId: "x" } },
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("addLabelIds");
  });

  it("does not let viewers delete a label and its plan with it", async () => {
    const labelId = await createLabel("onboarding");
    await enable(labelId);
    await addMember(VIEWER, "viewer");

    for (const response of [
      await call("DELETE", web(`/labels/${labelId}`), { as: VIEWER }),
      await call("PATCH", web(`/labels/${labelId}`), {
        as: VIEWER,
        body: { name: "renamed" },
      }),
      await call("POST", web("/labels"), {
        as: VIEWER,
        body: { name: "new", color: "#3b82f6" },
      }),
    ]) {
      expect(response.status).toBe(403);
    }
    const listed = await json<{ epics: EpicPayload[] }>(
      await call("GET", api("/epics")),
    );
    expect(listed.epics.map((epic) => epic.labelName)).toEqual(["onboarding"]);
  });

  it("filters an epic's stories by its label", async () => {
    const labelId = await createLabel("onboarding");
    const epic = await epicOf(await enable(labelId));
    const created = await json<{ story: { id: string; storyNumber: number } }>(
      await call("POST", web("/stories"), { body: { title: "with label" } }),
    );
    await call("POST", web("/stories"), { body: { title: "without label" } });
    const titles = async () =>
      (
        await json<{ stories: Array<{ title: string }> }>(
          await call("GET", web(`/stories?epicIds=${epic.id}`)),
        )
      ).stories.map((story) => story.title);

    expect(await titles()).toEqual([]);
    await call("PATCH", web(`/stories/${created.story.storyNumber}`), {
      body: { addLabelIds: [labelId] },
    });
    expect(await titles()).toEqual(["with label"]);
    await call("PATCH", web(`/stories/${created.story.storyNumber}`), {
      body: { removeLabelIds: [labelId] },
    });
    expect(await titles()).toEqual([]);
  });

  describe("MCP", () => {
    const callTool = async (name: string, args: Record<string, unknown>) => {
      tokens.mcp ??= await issueAccessToken(
        OWNER,
        "https://localhost/programmatic-api/mcp",
      );
      const response = await SELF.fetch(
        "https://localhost/programmatic-api/mcp",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${tokens.mcp}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2025-03-26",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: name,
            method: "tools/call",
            params: { name, arguments: args },
          }),
        },
      );
      const body = await response.text();
      const data = body.includes("data: ")
        ? body
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice("data: ".length))
            .join("\n")
        : body;
      const result = (
        JSON.parse(data) as {
          result: { content: Array<{ text: string }>; isError?: boolean };
        }
      ).result;
      return {
        isError: result.isError === true,
        text: result.content[0]?.text ?? "",
      };
    };

    it("turns planning on, saves and reads the plan", async () => {
      const labelId = await createLabel("onboarding");

      const labels = await callTool("list_labels", { projectId });
      expect(JSON.parse(labels.text)).toEqual({
        labels: [{ id: labelId, name: "onboarding", color: "#3b82f6" }],
      });

      const enabled = await callTool("enable_label_epic", {
        projectId,
        labelId,
      });
      expect(JSON.parse(enabled.text).epic).toMatchObject({
        enabled: true,
        revision: 1,
      });

      const saved = await callTool("update_label_epic_plan", {
        projectId,
        labelId,
        revision: 1,
        description: "Purpose",
        plannedStart: "2026-11-01",
        plannedEnd: "2026-11-30",
      });
      expect(saved.isError).toBe(false);

      const read = await callTool("get_label_epic", { projectId, labelId });
      expect(JSON.parse(read.text).epic).toMatchObject({
        description: "Purpose",
        plannedStart: "2026-11-01",
        plannedEnd: "2026-11-30",
        revision: 2,
      });

      const stale = await callTool("disable_label_epic", {
        projectId,
        labelId,
        revision: 1,
      });
      expect(stale).toMatchObject({ isError: true });
      expect(stale.text).toContain("REVISION_CONFLICT");

      const halfPeriod = await callTool("update_label_epic_plan", {
        projectId,
        labelId,
        revision: 2,
        plannedStart: "2026-11-01",
      });
      expect(halfPeriod.isError).toBe(true);
    });
  });
});
