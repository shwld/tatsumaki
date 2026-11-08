import { SELF, env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";
import { createDb } from "../src/infrastructure/db/client";
import { projectLabelsTable } from "../src/infrastructure/db/schema/project-labels";

function labelsApiPath(projectId: string): string {
  return `https://localhost/api/projects/${projectId}/labels`;
}

function labelApiPath(projectId: string, labelId: string): string {
  return `${labelsApiPath(projectId)}/${labelId}`;
}

function storiesApiPath(projectId: string): string {
  return `https://localhost/api/projects/${projectId}/stories`;
}

function storyApiPath(projectId: string, storyNumber: number): string {
  return `${storiesApiPath(projectId)}/${storyNumber}`;
}

describe("project labels routes", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
  });

  const fetchWithAuth = async (
    url: string,
    init: RequestInit = {},
    overrides?: Parameters<typeof createAuthHeaders>[0],
  ) => {
    const headers = new Headers(init.headers);
    const authHeaders = await createAuthHeaders(overrides);

    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value);
    }

    return SELF.fetch(url, {
      ...init,
      headers,
    });
  };

  async function createProject(): Promise<string> {
    const response = await fetchWithAuth("https://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test Project" }),
    });
    const data = (await response.json()) as { project: { id: string } };
    return data.project.id;
  }

  async function createStory(
    projectId: string,
    labelNames: string[],
  ): Promise<{ storyNumber: number }> {
    const existing = (await (
      await fetchWithAuth(labelsApiPath(projectId))
    ).json()) as { labels: Array<{ id: string; name: string }> };
    const labelIds: string[] = [];
    for (const name of labelNames) {
      labelIds.push(
        existing.labels.find((label) => label.name === name)?.id ??
          (await createLabel(projectId, name)),
      );
    }
    const response = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Story with labels",
        description: "Used for project label cascade test",
        labelIds,
      }),
    });
    expect(response.status).toBe(201);
    const data = (await response.json()) as { story: { storyNumber: number } };
    return { storyNumber: data.story.storyNumber };
  }

  it("lists labels for a project (initially empty)", async () => {
    const projectId = await createProject();

    const response = await fetchWithAuth(labelsApiPath(projectId));
    expect(response.status).toBe(200);

    const data = (await response.json()) as { labels: unknown[] };
    expect(data.labels).toEqual([]);
  });

  it("creates a label", async () => {
    const projectId = await createProject();

    const response = await fetchWithAuth(labelsApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "backend", color: "#3b82f6" }),
    });
    expect(response.status).toBe(201);

    const data = (await response.json()) as {
      label: { name: string; color: string; projectId: string };
    };
    expect(data.label.name).toBe("backend");
    expect(data.label.color).toBe("#3b82f6");
    expect(data.label.projectId).toBe(projectId);
  });

  it("rejects duplicate label names", async () => {
    const projectId = await createProject();

    await fetchWithAuth(labelsApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "backend", color: "#3b82f6" }),
    });

    const response = await fetchWithAuth(labelsApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "backend", color: "#ef4444" }),
    });
    expect(response.status).toBe(409);
  });

  it("updates a label name and color", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(labelsApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "backend", color: "#3b82f6" }),
    });
    const created = (await createResponse.json()) as {
      label: { id: string };
    };

    const response = await fetchWithAuth(
      labelApiPath(projectId, created.label.id),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "frontend", color: "#ef4444" }),
      },
    );
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      label: { name: string; color: string };
    };
    expect(data.label.name).toBe("frontend");
    expect(data.label.color).toBe("#ef4444");
  });

  async function createLabel(
    projectId: string,
    name: string,
    color = "#3b82f6",
  ): Promise<string> {
    const response = await fetchWithAuth(labelsApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    const created = (await response.json()) as { label: { id: string } };
    return created.label.id;
  }

  async function getStory(
    projectId: string,
    storyNumber: number,
  ): Promise<{ labels: string[]; labelIds: string[] }> {
    const response = await fetchWithAuth(storyApiPath(projectId, storyNumber));
    return (
      (await response.json()) as {
        story: { labels: string[]; labelIds: string[] };
      }
    ).story;
  }

  it("keeps story membership when a label is renamed", async () => {
    const projectId = await createProject();
    const backendId = await createLabel(projectId, "backend");
    const story = await createStory(projectId, ["backend", "frontend"]);

    const response = await fetchWithAuth(labelApiPath(projectId, backendId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "platform" }),
    });
    expect(response.status).toBe(200);

    const stored = await getStory(projectId, story.storyNumber);
    expect(stored.labels).toEqual(["frontend", "platform"]);
    expect(stored.labelIds).toContain(backendId);
  });

  it("deletes a label", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(labelsApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "backend", color: "#3b82f6" }),
    });
    const created = (await createResponse.json()) as {
      label: { id: string };
    };

    const response = await fetchWithAuth(
      labelApiPath(projectId, created.label.id),
      { method: "DELETE" },
    );
    expect(response.status).toBe(204);

    const listResponse = await fetchWithAuth(labelsApiPath(projectId));
    const data = (await listResponse.json()) as { labels: unknown[] };
    expect(data.labels).toEqual([]);
  });

  it("removes a deleted label from its stories only", async () => {
    const projectId = await createProject();
    const backendId = await createLabel(projectId, "backend");
    const story = await createStory(projectId, ["backend", "frontend"]);

    const response = await fetchWithAuth(labelApiPath(projectId, backendId), {
      method: "DELETE",
    });
    expect(response.status).toBe(204);

    const stored = await getStory(projectId, story.storyNumber);
    expect(stored.labels).toEqual(["frontend"]);
    expect(stored.labelIds).not.toContain(backendId);
  });

  it("keeps labels and stories unchanged when rename fails", async () => {
    const projectId = await createProject();
    const backendId = await createLabel(projectId, "backend");
    await createLabel(projectId, "frontend", "#ef4444");
    const story = await createStory(projectId, ["backend", "frontend"]);

    const response = await fetchWithAuth(labelApiPath(projectId, backendId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "frontend" }),
    });
    expect(response.status).toBe(409);

    const label = await createDb(env.DB)
      .select({ name: projectLabelsTable.name })
      .from(projectLabelsTable)
      .where(eq(projectLabelsTable.id, backendId))
      .get();
    expect(label?.name).toBe("backend");
    const stored = await getStory(projectId, story.storyNumber);
    expect(stored.labels).toEqual(["backend", "frontend"]);
  });

  it("keeps story update API behavior after label cascade changes", async () => {
    const projectId = await createProject();
    const story = await createStory(projectId, ["backend"]);
    const frontendId = await createLabel(projectId, "frontend");
    const highId = await createLabel(projectId, "priority:high");

    const response = await fetchWithAuth(
      storyApiPath(projectId, story.storyNumber),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Updated title",
          labelIds: [frontendId, highId],
        }),
      },
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      story: { title: string; labels: string[] };
    };
    expect(payload.story.title).toBe("Updated title");
    expect(payload.story.labels.sort()).toEqual(["frontend", "priority:high"]);
  });

  it("rejects invalid color format", async () => {
    const projectId = await createProject();

    const response = await fetchWithAuth(labelsApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "test", color: "not-a-color" }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects empty label name", async () => {
    const projectId = await createProject();

    const response = await fetchWithAuth(labelsApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "  ", color: "#3b82f6" }),
    });
    expect(response.status).toBe(400);
  });
});
