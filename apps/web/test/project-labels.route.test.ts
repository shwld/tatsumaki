import { SELF, env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";
import { createDb } from "../src/infrastructure/db/client";
import { projectLabelsTable } from "../src/infrastructure/db/schema/project-labels";
import { storiesTable } from "../src/infrastructure/db/schema/stories";

function labelsApiPath(projectId: string): string {
  return `http://localhost/api/projects/${projectId}/labels`;
}

function labelApiPath(projectId: string, labelId: string): string {
  return `${labelsApiPath(projectId)}/${labelId}`;
}

function storiesApiPath(projectId: string): string {
  return `http://localhost/api/projects/${projectId}/stories`;
}

function storyApiPath(projectId: string, storyNumber: number): string {
  return `${storiesApiPath(projectId)}/${storyNumber}`;
}

async function withSuppressedConsoleError<T>(
  callback: () => Promise<T>,
): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await callback();
  } finally {
    console.error = original;
  }
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
    const response = await fetchWithAuth("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test Project" }),
    });
    const data = (await response.json()) as { project: { id: string } };
    return data.project.id;
  }

  async function createStory(
    projectId: string,
    labels: string[],
  ): Promise<{ storyNumber: number }> {
    const response = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Story with labels",
        description: "Used for project label cascade test",
        labels,
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

  it("cascades label rename to stories and deduplicates labels", async () => {
    const projectId = await createProject();
    const story = await createStory(projectId, ["backend", "frontend"]);

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
        body: JSON.stringify({ name: "frontend" }),
      },
    );
    expect(response.status).toBe(200);

    const storyResponse = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/stories/${story.storyNumber}`,
    );
    const storyPayload = (await storyResponse.json()) as {
      story: { labels: string[] };
    };
    expect(storyPayload.story.labels).toEqual(["frontend"]);
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

  it("cascades label delete to stories", async () => {
    const projectId = await createProject();
    const story = await createStory(projectId, ["backend", "frontend"]);

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

    const storyResponse = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/stories/${story.storyNumber}`,
    );
    const storyPayload = (await storyResponse.json()) as {
      story: { labels: string[] };
    };
    expect(storyPayload.story.labels).toEqual(["frontend"]);
  });

  it("keeps labels and stories unchanged when rename fails", async () => {
    const projectId = await createProject();
    const story = await createStory(projectId, ["backend", "frontend"]);

    const backendResponse = await fetchWithAuth(labelsApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "backend", color: "#3b82f6" }),
    });
    const backendLabel = (await backendResponse.json()) as {
      label: { id: string };
    };

    await fetchWithAuth(labelsApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "frontend", color: "#ef4444" }),
    });

    const response = await fetchWithAuth(
      labelApiPath(projectId, backendLabel.label.id),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "frontend" }),
      },
    );
    expect(response.status).toBe(409);

    const db = createDb(env.DB);
    const label = await db
      .select({ name: projectLabelsTable.name })
      .from(projectLabelsTable)
      .where(eq(projectLabelsTable.id, backendLabel.label.id))
      .get();
    expect(label?.name).toBe("backend");

    const updatedStory = await db
      .select({ labels: storiesTable.labels })
      .from(storiesTable)
      .where(
        and(
          eq(storiesTable.projectId, projectId),
          eq(storiesTable.storyNumber, story.storyNumber),
        ),
      )
      .get();
    expect(updatedStory).not.toBeUndefined();
    expect(JSON.parse(updatedStory?.labels ?? "[]")).toEqual([
      "backend",
      "frontend",
    ]);
  });

  it("rolls back label rename when story cascade update fails", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(labelsApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "backend", color: "#3b82f6" }),
    });
    const created = (await createResponse.json()) as {
      label: { id: string };
    };

    const story = await createStory(projectId, ["backend"]);
    const db = createDb(env.DB);
    await db
      .update(storiesTable)
      .set({ labels: "not-json" })
      .where(
        and(
          eq(storiesTable.projectId, projectId),
          eq(storiesTable.storyNumber, story.storyNumber),
        ),
      );

    const response = await withSuppressedConsoleError(() =>
      fetchWithAuth(labelApiPath(projectId, created.label.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "platform" }),
      }),
    );
    expect(response.status).toBe(500);

    const label = await db
      .select({ name: projectLabelsTable.name })
      .from(projectLabelsTable)
      .where(eq(projectLabelsTable.id, created.label.id))
      .get();
    expect(label?.name).toBe("backend");

    const unchangedStory = await db
      .select({ labels: storiesTable.labels })
      .from(storiesTable)
      .where(
        and(
          eq(storiesTable.projectId, projectId),
          eq(storiesTable.storyNumber, story.storyNumber),
        ),
      )
      .get();
    expect(unchangedStory?.labels).toBe("not-json");
  });

  it("rolls back label delete when story cascade update fails", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(labelsApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "backend", color: "#3b82f6" }),
    });
    const created = (await createResponse.json()) as {
      label: { id: string };
    };

    const story = await createStory(projectId, ["backend"]);
    const db = createDb(env.DB);
    await db
      .update(storiesTable)
      .set({ labels: "not-json" })
      .where(
        and(
          eq(storiesTable.projectId, projectId),
          eq(storiesTable.storyNumber, story.storyNumber),
        ),
      );

    const response = await withSuppressedConsoleError(() =>
      fetchWithAuth(labelApiPath(projectId, created.label.id), {
        method: "DELETE",
      }),
    );
    expect(response.status).toBe(500);

    const label = await db
      .select({ id: projectLabelsTable.id })
      .from(projectLabelsTable)
      .where(eq(projectLabelsTable.id, created.label.id))
      .get();
    expect(label?.id).toBe(created.label.id);
  });

  it("keeps story update API behavior after label cascade changes", async () => {
    const projectId = await createProject();
    const story = await createStory(projectId, ["backend"]);

    const response = await fetchWithAuth(
      storyApiPath(projectId, story.storyNumber),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Updated title",
          labels: ["frontend", "priority:high"],
        }),
      },
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      story: { title: string; labels: string[] };
    };
    expect(payload.story.title).toBe("Updated title");
    expect(payload.story.labels).toEqual(["frontend", "priority:high"]);
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
