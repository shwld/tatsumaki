import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { createDb } from "../src/infrastructure/db/client";
import { iterationsTable } from "../src/infrastructure/db/schema/iterations";
import { storiesTable } from "../src/infrastructure/db/schema/stories";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";

function iterationsApiPath(projectId: string): string {
  return `http://localhost/api/projects/${projectId}/iterations`;
}

function iterationOverrideApiPath(
  projectId: string,
  iterationNumber: number,
): string {
  return `${iterationsApiPath(projectId)}/${iterationNumber}/override`;
}

function iterationBurndownApiUrl(
  projectId: string,
  iterationId: string,
): string {
  return `${iterationsApiPath(projectId)}/${iterationId}/burndown`;
}

function addUtcDays(isoDay: string, delta: number): string {
  const ms = Date.parse(`${isoDay}T12:00:00.000Z`);
  return new Date(ms + delta * 86_400_000).toISOString().slice(0, 10);
}

function iterationStoriesApiPath(
  projectId: string,
  iterationId: string,
): string {
  return `${iterationsApiPath(projectId)}/${iterationId}/stories`;
}

function iterationStoryApiPath(
  projectId: string,
  iterationId: string,
  storyId: string,
): string {
  return `${iterationStoriesApiPath(projectId, iterationId)}/${storyId}`;
}

describe("iteration routes", () => {
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
    return SELF.fetch(url, { ...init, headers });
  };

  const createProject = async () => {
    const response = await fetchWithAuth("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test Project" }),
    });
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { project: { id: string } };
    return payload.project.id;
  };

  /** Insert an iteration directly into the DB (no API route needed). */
  const insertIteration = async (
    projectId: string,
    startDate: string,
    endDate: string,
    iterationNumber: number,
  ): Promise<string> => {
    const db = createDb(env.DB);
    const id = ulid();
    const now = new Date().toISOString();
    await db.insert(iterationsTable).values({
      id,
      projectId,
      iterationNumber,
      startDate,
      endDate,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  };

  const createStory = async (projectId: string, title: string) => {
    const response = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/stories`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description: "Test description" }),
      },
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { story: { id: string } };
    return payload.story.id;
  };

  it("lists iterations with velocity", async () => {
    const projectId = await createProject();
    await insertIteration(projectId, "2026-04-01", "2026-04-15", 1);

    const listResponse = await fetchWithAuth(iterationsApiPath(projectId));
    expect(listResponse.status).toBe(200);

    const listed = (await listResponse.json()) as {
      iterations: Array<{
        id: string;
        iterationNumber: number;
        effectiveSprintUtilizationPercent: number;
      }>;
      iterationOverrides: Array<{
        projectId: string;
        iterationNumber: number;
        sprintUtilizationPercent: number;
      }>;
      velocity: number;
    };
    expect(listed.iterations).toHaveLength(1);
    expect(listed.iterations[0]?.iterationNumber).toBe(1);
    expect(listed.iterations[0]?.effectiveSprintUtilizationPercent).toBe(100);
    expect(listed.iterationOverrides).toHaveLength(0);
    // Default initial velocity (10) when no completed iterations exist
    expect(listed.velocity).toBe(10);
  });

  it("updates sprint utilization override by iteration number", async () => {
    const projectId = await createProject();
    await insertIteration(projectId, "2026-04-01", "2026-04-15", 1);

    const updateResponse = await fetchWithAuth(
      iterationOverrideApiPath(projectId, 1),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sprintUtilizationPercent: 60 }),
      },
    );
    expect(updateResponse.status).toBe(200);
    const updated = (await updateResponse.json()) as {
      iterationOverride: { sprintUtilizationPercent: number };
    };
    expect(updated.iterationOverride.sprintUtilizationPercent).toBe(60);
  });

  it("rejects invalid sprint utilization value", async () => {
    const projectId = await createProject();
    await insertIteration(projectId, "2026-04-01", "2026-04-15", 1);

    const updateResponse = await fetchWithAuth(
      iterationOverrideApiPath(projectId, 1),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sprintUtilizationPercent: 101 }),
      },
    );
    expect(updateResponse.status).toBe(400);
  });

  it("stores override for future iteration number without iteration record", async () => {
    const projectId = await createProject();
    await insertIteration(projectId, "2026-04-01", "2026-04-15", 1);

    const updateResponse = await fetchWithAuth(
      iterationOverrideApiPath(projectId, 5),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sprintUtilizationPercent: 40 }),
      },
    );
    expect(updateResponse.status).toBe(200);

    const listResponse = await fetchWithAuth(iterationsApiPath(projectId));
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      iterationOverrides: Array<{
        iterationNumber: number;
        sprintUtilizationPercent: number;
      }>;
    };
    expect(
      listed.iterationOverrides.find(
        (override) => override.iterationNumber === 5,
      ),
    ).toMatchObject({
      iterationNumber: 5,
      sprintUtilizationPercent: 40,
    });
  });

  it("deletes override and treats 100 as default", async () => {
    const projectId = await createProject();
    await insertIteration(projectId, "2026-04-01", "2026-04-15", 1);

    const createResponse = await fetchWithAuth(
      iterationOverrideApiPath(projectId, 1),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sprintUtilizationPercent: 50 }),
      },
    );
    expect(createResponse.status).toBe(200);

    const deleteResponse = await fetchWithAuth(
      iterationOverrideApiPath(projectId, 1),
      {
        method: "DELETE",
      },
    );
    expect(deleteResponse.status).toBe(200);

    const resetResponse = await fetchWithAuth(
      iterationOverrideApiPath(projectId, 1),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sprintUtilizationPercent: 100 }),
      },
    );
    expect(resetResponse.status).toBe(200);

    const listResponse = await fetchWithAuth(iterationsApiPath(projectId));
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      iterationOverrides: Array<{
        iterationNumber: number;
      }>;
      iterations: Array<{ effectiveSprintUtilizationPercent: number }>;
    };
    expect(
      listed.iterationOverrides.find(
        (override) => override.iterationNumber === 1,
      ),
    ).toBeUndefined();
    expect(listed.iterations[0]?.effectiveSprintUtilizationPercent).toBe(100);
  });

  it("assigns and unassigns a story to an iteration", async () => {
    const projectId = await createProject();
    const storyId = await createStory(projectId, "Test Story");
    const iterationId = await insertIteration(
      projectId,
      "2026-04-01",
      "2026-04-15",
      1,
    );

    // Assign
    const assignResponse = await fetchWithAuth(
      iterationStoriesApiPath(projectId, iterationId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId }),
      },
    );
    expect(assignResponse.status).toBe(200);

    // Verify assignment via stories list
    const storiesResponse = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/stories`,
    );
    const storiesData = (await storiesResponse.json()) as {
      stories: Array<{ id: string; iterationId: string | null }>;
    };
    const assignedStory = storiesData.stories.find((s) => s.id === storyId);
    expect(assignedStory?.iterationId).toBe(iterationId);

    // Unassign
    const unassignResponse = await fetchWithAuth(
      iterationStoryApiPath(projectId, iterationId, storyId),
      { method: "DELETE" },
    );
    expect(unassignResponse.status).toBe(200);

    // Verify unassignment
    const storiesAfter = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/stories`,
    );
    const storiesAfterData = (await storiesAfter.json()) as {
      stories: Array<{ id: string; iterationId: string | null }>;
    };
    const unassignedStory = storiesAfterData.stories.find(
      (s) => s.id === storyId,
    );
    expect(unassignedStory?.iterationId).toBeNull();
  });

  it("returns 404 when assigning to non-existent iteration", async () => {
    const projectId = await createProject();
    const storyId = await createStory(projectId, "Test Story");

    const response = await fetchWithAuth(
      iterationStoriesApiPath(projectId, "non-existent-id"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId }),
      },
    );
    expect(response.status).toBe(404);
  });

  it("returns burndown payload for the current iteration", async () => {
    const projectId = await createProject();
    const today = new Date().toISOString().slice(0, 10);
    const start = addUtcDays(today, -2);
    const endExclusive = addUtcDays(today, 5);
    const iterationId = await insertIteration(
      projectId,
      start,
      endExclusive,
      1,
    );

    const db = createDb(env.DB);
    const storyId = ulid();
    const timestamp = new Date().toISOString();
    await db.insert(storiesTable).values({
      id: storyId,
      storyNumber: 1,
      projectId,
      title: "Burndown fixture",
      description: "-",
      type: "chore",
      status: "Started",
      storyPoint: 5,
      labels: "[]",
      iterationId,
      position: 1,
      isIcebox: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const response = await fetchWithAuth(
      iterationBurndownApiUrl(projectId, iterationId),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      burndownScopePoints: number;
      days: Array<{ date: string; idealRemaining: number }>;
    };
    expect(payload.burndownScopePoints).toBe(5);
    expect(payload.days.length).toBeGreaterThan(0);
    expect(payload.days.some((d) => d.idealRemaining <= 5)).toBe(true);
  });

  it("returns 404 for burndown when iteration is not current", async () => {
    const projectId = await createProject();
    const today = new Date().toISOString().slice(0, 10);
    const start = addUtcDays(today, -20);
    const endExclusive = addUtcDays(today, -5);
    const iterationId = await insertIteration(
      projectId,
      start,
      endExclusive,
      1,
    );

    const response = await fetchWithAuth(
      iterationBurndownApiUrl(projectId, iterationId),
    );
    expect(response.status).toBe(404);
  });
});
