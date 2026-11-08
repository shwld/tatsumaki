import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";

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

  it("resolves legacy label names to IDs and creates missing labels", async () => {
    const projectId = await createProject();
    const backend = await createLabel(projectId, "backend");

    const { story } = await createStory(projectId, {
      labels: [" backend ", "new-label"],
    });

    expect(story.labels).toEqual(["backend", "new-label"]);
    expect(story.labelIds).toContain(backend);

    const labelsRes = await api(`/projects/${projectId}/labels`);
    const { labels } = (await labelsRes.json()) as {
      labels: { name: string }[];
    };
    expect(labels.map((l) => l.name)).toEqual(["backend", "new-label"]);
  });

  it("filters by label name through story_labels", async () => {
    const projectId = await createProject();
    const a = await createLabel(projectId, "a");
    await createStory(projectId, { title: "with a", labelIds: [a] });
    await createStory(projectId, { title: "without" });

    const res = await api(`/projects/${projectId}/stories?labels=a`);
    const { stories } = (await res.json()) as { stories: { title: string }[] };
    expect(stories.map((s) => s.title)).toEqual(["with a"]);
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
