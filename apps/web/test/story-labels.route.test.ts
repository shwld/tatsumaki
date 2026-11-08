import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";
import { D1StoryRepository } from "../src/infrastructure/db/repositories/d1-story-repository";

type StoryPayload = {
  id: string;
  storyNumber: number;
  labels: string[];
  labelIds: string[];
};

describe("story labels by ID", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
  });

  async function api(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    for (const [k, v] of Object.entries(await createAuthHeaders())) {
      headers.set(k, v);
    }
    return SELF.fetch(`https://localhost/api${path}`, { ...init, headers });
  }

  async function createProject(): Promise<string> {
    const res = await api("/projects", {
      method: "POST",
      body: JSON.stringify({ name: "Test Project" }),
    });
    return ((await res.json()) as { project: { id: string } }).project.id;
  }

  async function createLabel(projectId: string, name: string): Promise<string> {
    const res = await api(`/projects/${projectId}/labels`, {
      method: "POST",
      body: JSON.stringify({ name, color: "#3b82f6" }),
    });
    return ((await res.json()) as { label: { id: string } }).label.id;
  }

  async function createStory(
    projectId: string,
    body: Record<string, unknown> = {},
  ): Promise<{ status: number; story: StoryPayload }> {
    const res = await api(`/projects/${projectId}/stories`, {
      method: "POST",
      body: JSON.stringify({ title: "Story", ...body }),
    });
    const json = (await res.json()) as { story: StoryPayload };
    return { status: res.status, story: json.story };
  }

  async function patchStory(
    projectId: string,
    storyNumber: number,
    body: Record<string, unknown>,
  ) {
    const res = await api(`/projects/${projectId}/stories/${storyNumber}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      story: ((await res.json()) as { story: StoryPayload }).story,
    };
  }

  it("creates a story with labelIds", async () => {
    const projectId = await createProject();
    const backend = await createLabel(projectId, "backend");

    const { status, story } = await createStory(projectId, {
      labelIds: [backend],
    });

    expect(status).toBe(201);
    expect(story.labelIds).toEqual([backend]);
    expect(story.labels).toEqual(["backend"]);
  });

  it("rejects labels from another project", async () => {
    const projectId = await createProject();
    const otherProjectId = await createProject();
    const foreign = await createLabel(otherProjectId, "foreign");
    const own = await createLabel(projectId, "own");
    const { story } = await createStory(projectId, { labelIds: [own] });

    const createRes = await api(`/projects/${projectId}/stories`, {
      method: "POST",
      body: JSON.stringify({ title: "x", labelIds: [foreign] }),
    });
    expect(createRes.status).toBe(400);

    const patched = await patchStory(projectId, story.storyNumber, {
      addLabelIds: [foreign],
    });
    expect(patched.status).toBe(400);
  });

  it("adds and removes labels without touching the rest", async () => {
    const projectId = await createProject();
    const a = await createLabel(projectId, "a");
    const b = await createLabel(projectId, "b");
    const c = await createLabel(projectId, "c");
    const { story } = await createStory(projectId, { labelIds: [a] });

    const added = await patchStory(projectId, story.storyNumber, {
      addLabelIds: [b, c, b],
    });
    expect(added.story.labels).toEqual(["a", "b", "c"]);

    const removed = await patchStory(projectId, story.storyNumber, {
      removeLabelIds: [a],
    });
    expect(removed.story.labelIds.sort()).toEqual([b, c].sort());
  });

  it("does not drop labels added concurrently", async () => {
    const projectId = await createProject();
    const a = await createLabel(projectId, "a");
    const b = await createLabel(projectId, "b");
    const { story } = await createStory(projectId);

    await Promise.all([
      patchStory(projectId, story.storyNumber, { addLabelIds: [a] }),
      patchStory(projectId, story.storyNumber, { addLabelIds: [b] }),
    ]);

    const res = await api(
      `/projects/${projectId}/stories/${story.storyNumber}`,
    );
    const stored = ((await res.json()) as { story: StoryPayload }).story;
    expect(stored.labels).toEqual(["a", "b"]);
  });

  it("replaces the set with labelIds", async () => {
    const projectId = await createProject();
    const a = await createLabel(projectId, "a");
    const b = await createLabel(projectId, "b");
    const { story } = await createStory(projectId, { labelIds: [a] });

    const replaced = await patchStory(projectId, story.storyNumber, {
      labelIds: [b],
    });
    expect(replaced.story.labelIds).toEqual([b]);
  });

  it("rejects label names on create, update and bulk add", async () => {
    const projectId = await createProject();
    const a = await createLabel(projectId, "a");
    const { story } = await createStory(projectId, { labelIds: [a] });

    const created = await api(`/projects/${projectId}/stories`, {
      method: "POST",
      body: JSON.stringify({ title: "x", labels: ["a"] }),
    });
    expect(created.status).toBe(400);

    const patched = await api(
      `/projects/${projectId}/stories/${story.storyNumber}`,
      { method: "PATCH", body: JSON.stringify({ labels: ["a"] }) },
    );
    expect(patched.status).toBe(400);

    const bulk = await api(`/projects/${projectId}/stories/bulk-labels`, {
      method: "PATCH",
      body: JSON.stringify({ storyIds: [story.id], labels: ["a"] }),
    });
    expect(bulk.status).toBe(400);

    const listed = await api(`/projects/${projectId}/stories?labels=a`);
    expect(listed.status).toBe(400);
  });

  it("filters by labelIds with OR and lists a story once across pages", async () => {
    const projectId = await createProject();
    const a = await createLabel(projectId, "a");
    const b = await createLabel(projectId, "b");
    await createStory(projectId, { title: "both", labelIds: [a, b] });
    await createStory(projectId, { title: "only a", labelIds: [a] });
    await createStory(projectId, { title: "only b", labelIds: [b] });
    await createStory(projectId, { title: "without" });

    const titles = async (query: string) => {
      const res = await api(`/projects/${projectId}/stories?${query}`);
      expect(res.status).toBe(200);
      return ((await res.json()) as { stories: { title: string }[] }).stories
        .map((s) => s.title)
        .sort();
    };

    expect(await titles(`labelIds=${a}`)).toEqual(["both", "only a"]);
    expect(await titles(`labelIds=${a},${b}`)).toEqual([
      "both",
      "only a",
      "only b",
    ]);

    const paged: string[] = [];
    for (const offset of [0, 1, 2, 3]) {
      paged.push(
        ...(await titles(`labelIds=${a},${b}&limit=1&offset=${offset}`)),
      );
    }
    expect(paged.sort()).toEqual(["both", "only a", "only b"]);
  });

  it("handles more labels than the D1 bind limit", async () => {
    const projectId = await createProject();
    const ids: string[] = [];
    for (let i = 0; i < 150; i += 1) {
      ids.push(await createLabel(projectId, `label-${i}`));
    }

    const { status, story } = await createStory(projectId, { labelIds: ids });
    expect(status).toBe(201);
    expect(story.labelIds).toHaveLength(150);

    const cleared = await patchStory(projectId, story.storyNumber, {
      labelIds: [],
    });
    expect(cleared.story.labelIds).toEqual([]);

    const readded = await patchStory(projectId, story.storyNumber, {
      addLabelIds: ids.slice(0, 120),
    });
    expect(readded.story.labelIds).toHaveLength(120);
  });

  it("filters by more label IDs than the D1 bind limit", async () => {
    const projectId = await createProject();
    const ids: string[] = [];
    for (let i = 0; i < 120; i += 1) {
      ids.push(await createLabel(projectId, `bulk-${i}`));
    }
    await createStory(projectId, { title: "tagged", labelIds: [ids[119]!] });
    await createStory(projectId, { title: "plain" });

    const result = await new D1StoryRepository(env.DB).list({
      projectId,
      labelIds: ids,
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().map((story) => story.title)).toEqual([
      "tagged",
    ]);
  });

  it("records label changes by ID and shows current names in history", async () => {
    const projectId = await createProject();
    const a = await createLabel(projectId, "alpha");
    const { story } = await createStory(projectId);

    await patchStory(projectId, story.storyNumber, { addLabelIds: [a] });
    const renamed = await api(`/projects/${projectId}/labels/${a}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "beta" }),
    });
    expect(renamed.status).toBe(200);

    const stored = await env.DB.prepare(
      "select old_value, new_value from story_timeline_entries where field_name = 'labelIds'",
    ).first<{ old_value: string; new_value: string }>();
    expect(JSON.parse(stored?.new_value ?? "[]")).toEqual([a]);

    const history = await api(`/projects/${projectId}/history`);
    const entries = (
      (await history.json()) as {
        history: { fieldName: string; newValue: string | null }[];
      }
    ).history;
    const labelEntry = entries.find((e) => e.fieldName === "labels");
    expect(JSON.parse(labelEntry?.newValue ?? "[]")).toEqual(["beta"]);
  });

  it("rejects non-string labelIds", async () => {
    const projectId = await createProject();
    const res = await api(`/projects/${projectId}/stories`, {
      method: "POST",
      body: JSON.stringify({ title: "x", labelIds: [1] }),
    });
    expect(res.status).toBe(400);
  });
});
