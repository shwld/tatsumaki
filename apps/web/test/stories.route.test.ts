import { SELF, env } from "cloudflare:test";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";
import { createDb } from "../src/infrastructure/db/client";
import { iterationsTable } from "../src/infrastructure/db/schema/iterations";
import { storiesTable } from "../src/infrastructure/db/schema/stories";
import { storyTimelineEntriesTable } from "../src/infrastructure/db/schema/story-timeline";
import { todayIso } from "../src/shared/date/today-iso";

function storiesApiPath(projectId: string): string {
  return `http://localhost/api/projects/${projectId}/stories`;
}

function storyApiPath(projectId: string, storyId: string): string {
  return `${storiesApiPath(projectId)}/${storyId}`;
}

function storyReorderApiPath(projectId: string): string {
  return `${storiesApiPath(projectId)}/reorder`;
}

function storyBulkStatusApiPath(projectId: string): string {
  return `${storiesApiPath(projectId)}/bulk-status`;
}

function storyBulkLabelsApiPath(projectId: string): string {
  return `${storiesApiPath(projectId)}/bulk-labels`;
}

function storyPriorityHistoryApiPath(projectId: string): string {
  return `${storiesApiPath(projectId)}/priority-history`;
}

function storyTimelineApiPath(projectId: string, storyId: string): string {
  return `${storiesApiPath(projectId)}/${storyId}/timeline`;
}

function storyAttachmentsApiPath(projectId: string, storyId: string): string {
  return `${storiesApiPath(projectId)}/${storyId}/attachments`;
}

function storyAttachmentContentApiPath(
  projectId: string,
  storyId: string,
  attachmentId: string,
): string {
  return `${storyAttachmentsApiPath(projectId, storyId)}/${attachmentId}/content`;
}

describe("story routes", () => {
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

  const createProject = async (overrides?: {
    sub?: string;
    email?: string;
  }) => {
    const response = await fetchWithAuth(
      "http://localhost/api/projects",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Alpha Project" }),
      },
      overrides,
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { project: { id: string } };
    return payload.project.id;
  };

  const ensureCurrentIterationForTest = async (projectId: string) => {
    const db = createDb(env.DB);
    const today = todayIso();
    const existing = await db
      .select({ id: iterationsTable.id })
      .from(iterationsTable)
      .where(
        and(
          eq(iterationsTable.projectId, projectId),
          sql`${iterationsTable.startDate} <= ${today}`,
          sql`${iterationsTable.endDate} > ${today}`,
        ),
      )
      .get();
    if (existing) return existing.id;

    const now = new Date().toISOString();
    const [year, month, day] = today.split("-").map(Number);
    const tomorrow = new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1));
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const endDate = tomorrow.toISOString().slice(0, 10);
    const iterationId = `iter-${projectId}`;
    const existingNumbers = await db
      .select({ iterationNumber: iterationsTable.iterationNumber })
      .from(iterationsTable)
      .where(eq(iterationsTable.projectId, projectId))
      .all();
    const nextIterationNumber =
      existingNumbers.reduce(
        (max, row) => Math.max(max, row.iterationNumber),
        0,
      ) + 1;

    await db.insert(iterationsTable).values({
      id: iterationId,
      projectId,
      iterationNumber: nextIterationNumber,
      startDate: today,
      endDate,
      createdAt: now,
      updatedAt: now,
    });

    return iterationId;
  };

  const assignStoryToIterationForTest = async (
    projectId: string,
    storyId: string,
  ) => {
    const db = createDb(env.DB);
    const iterationId = await ensureCurrentIterationForTest(projectId);

    await db
      .update(storiesTable)
      .set({ iterationId })
      .where(eq(storiesTable.id, storyId));

    return iterationId;
  };

  it("creates a story with title, description, type, status and labels", async () => {
    const projectId = await createProject();

    const response = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Create authentication flow",
        description: "Implement login and logout",
        type: "feature",
        status: "Started",
        storyPoint: 3,
        labels: ["auth", "backend"],
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      story: {
        __typename: "Story",
        id: expect.any(String),
        projectId,
        title: "Create authentication flow",
        description: "Implement login and logout",
        type: "feature",
        status: "Started",
        storyNumber: 1,
        statusChangedAt: expect.any(String),
        completedAt: null,
        storyPoint: 3,
        labels: ["auth", "backend"],
        epicId: null,
        iterationId: null,
        isIcebox: false,
        ownerIds: [],
        requesterId: null,
        releaseDate: null,
        position: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        isBlocked: false,
        isBlocking: false,
        blockingStories: [],
        blockedStories: [],
      },
    });
  });

  it("creates a story with storyPoint=13", async () => {
    const projectId = await createProject();

    const response = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Estimate as 13 points",
        description: "Compatibility with PivotalTracker-like scale",
        type: "feature",
        status: "Started",
        storyPoint: 13,
        labels: [],
      }),
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      story: { storyPoint: number | null };
    };
    expect(payload.story.storyPoint).toBe(13);
  });

  it("updates story content and labels", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Initial title",
        description: "Initial description",
      }),
    });
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const updateResponse = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Updated title",
          description: "Updated description",
          storyPoint: 8,
          labels: ["ui", "priority:high"],
        }),
      },
    );

    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toEqual({
      story: {
        __typename: "Story",
        id: created.story.id,
        projectId,
        title: "Updated title",
        description: "Updated description",
        type: "feature",
        status: "Unstarted",
        storyNumber: 1,
        statusChangedAt: expect.any(String),
        completedAt: null,
        storyPoint: 8,
        labels: ["ui", "priority:high"],
        epicId: null,
        iterationId: null,
        isIcebox: false,
        ownerIds: [],
        requesterId: null,
        releaseDate: null,
        position: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        isBlocked: false,
        isBlocking: false,
        blockingStories: [],
        blockedStories: [],
      },
    });
  });

  it("updates storyPoint to 13", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Initial title",
        description: "Initial description",
      }),
    });
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const updateResponse = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storyPoint: 13,
        }),
      },
    );

    expect(updateResponse.status).toBe(200);
    const payload = (await updateResponse.json()) as {
      story: { storyPoint: number | null };
    };
    expect(payload.story.storyPoint).toBe(13);
  });

  it("notifies assignees when a tracked story field changes", async () => {
    const projectId = await createProject();

    const db = env.DB as {
      prepare: (sql: string) => {
        bind: (...values: Array<string | number | null>) => {
          run: () => Promise<unknown>;
        };
      };
    };

    await db
      .prepare(
        "insert into project_members (project_id, user_id, role) values (?, ?, ?)",
      )
      .bind(projectId, "github|assignee", "member")
      .run();

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Owned story",
        description: "d",
        type: "feature",
        status: "Unstarted",
        storyPoint: 3,
        labels: [],
        ownerIds: ["github|assignee"],
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number; title: string };
    };

    const updateResponse = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Owned story (edited)" }),
      },
    );
    expect(updateResponse.status).toBe(200);

    const notificationsResponse = await fetchWithAuth(
      `http://localhost/api/auth/me/notifications?projectId=${projectId}&kinds=story_activity&limit=10`,
      {},
      { sub: "github|assignee", email: "assignee@example.com" },
    );
    expect(notificationsResponse.status).toBe(200);
    const notificationPayload = (await notificationsResponse.json()) as {
      notifications: Array<{
        kind: string;
        storyId: string | null;
        storyTitle: string | null;
        message: string;
      }>;
    };
    const storyActivityNotes = notificationPayload.notifications.filter(
      (n) => n.kind === "story_activity",
    );
    expect(storyActivityNotes.length).toBeGreaterThanOrEqual(1);
    expect(
      storyActivityNotes.some((n) => n.storyTitle === "Owned story (edited)"),
    ).toBe(true);
  });

  it("returns summary stories when detail=summary", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Summary target",
        description: "Long description body",
        labels: ["perf"],
        ownerIds: ["github|test-user"],
      }),
    });
    expect(createResponse.status).toBe(201);

    const response = await fetchWithAuth(
      `${storiesApiPath(projectId)}?detail=summary`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stories: [
        expect.objectContaining({
          title: "Summary target",
          description: "",
          labels: [],
          ownerIds: [],
          isBlocked: false,
          isBlocking: false,
          blockingStories: [],
          blockedStories: [],
        }),
      ],
    });
  });

  it("returns block flags in summary stories", async () => {
    const projectId = await createProject();

    const createBlocking = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Blocking story",
        description: "Blocks another story",
      }),
    });
    const createBlocked = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Blocked story",
        description: "Blocked by another story",
      }),
    });
    const blockingStory = (await createBlocking.json()) as {
      story: { id: string; storyNumber: number };
    };
    const blockedStory = (await createBlocked.json()) as {
      story: { id: string; storyNumber: number };
    };

    const setBlockerResponse = await fetchWithAuth(
      `${storyApiPath(projectId, String(blockedStory.story.storyNumber))}/blockers`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          relation: "blockedBy",
          targetStoryId: blockingStory.story.id,
        }),
      },
    );
    expect(setBlockerResponse.status).toBe(200);

    const response = await fetchWithAuth(
      `${storiesApiPath(projectId)}?detail=summary`,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      stories: Array<{ id: string; isBlocked: boolean; isBlocking: boolean }>;
    };
    const blocking = payload.stories.find((story) => {
      return story.id === blockingStory.story.id;
    });
    const blocked = payload.stories.find((story) => {
      return story.id === blockedStory.story.id;
    });
    expect(blocking).toEqual(
      expect.objectContaining({ isBlocked: false, isBlocking: true }),
    );
    expect(blocked).toEqual(
      expect.objectContaining({ isBlocked: true, isBlocking: false }),
    );
  });

  it("gets full story detail by id", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Detail target",
        description: "Detailed body",
        labels: ["ui"],
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const response = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      story: expect.objectContaining({
        id: created.story.id,
        title: "Detail target",
        description: "Detailed body",
        labels: ["ui"],
      }),
    });
  });

  it("creates a release story with releaseDate and without description", async () => {
    const projectId = await createProject();

    const response = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "v1.0 リリース",
        description: "",
        type: "release",
        status: "Unstarted",
        storyPoint: null,
        labels: [],
        epicId: null,
        isIcebox: false,
        ownerIds: [],
        requesterId: null,
        releaseDate: "2026-04-24",
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      story: {
        __typename: "Story",
        id: expect.any(String),
        projectId,
        title: "v1.0 リリース",
        description: "",
        type: "release",
        status: "Unstarted",
        storyNumber: 1,
        statusChangedAt: expect.any(String),
        completedAt: null,
        storyPoint: null,
        labels: [],
        epicId: null,
        iterationId: null,
        isIcebox: false,
        ownerIds: [],
        requesterId: null,
        releaseDate: "2026-04-24",
        position: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        isBlocked: false,
        isBlocking: false,
        blockingStories: [],
        blockedStories: [],
      },
    });
  });

  it("sets story blockers and reflects the relationship on both stories", async () => {
    const projectId = await createProject();

    const createBlocking = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Backend API",
        description: "Provide endpoint",
      }),
    });
    const createBlocked = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Frontend UI",
        description: "Needs backend",
      }),
    });

    const blockingStory = (await createBlocking.json()) as {
      story: { id: string; storyNumber: number };
    };
    const blockedStory = (await createBlocked.json()) as {
      story: { id: string; storyNumber: number };
    };

    const setBlockerResponse = await fetchWithAuth(
      `${storyApiPath(projectId, String(blockedStory.story.storyNumber))}/blockers`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          relation: "blockedBy",
          targetStoryId: blockingStory.story.id,
        }),
      },
    );

    expect(setBlockerResponse.status).toBe(200);
    expect(await setBlockerResponse.json()).toEqual({
      story: expect.objectContaining({
        id: blockedStory.story.id,
        isBlocked: true,
        isBlocking: false,
        blockingStories: [{ id: blockingStory.story.id, title: "Backend API" }],
        blockedStories: [],
      }),
      relatedStory: expect.objectContaining({
        id: blockingStory.story.id,
        isBlocked: false,
        isBlocking: true,
      }),
    });

    const listResponse = await fetchWithAuth(storiesApiPath(projectId));
    expect(listResponse.status).toBe(200);
    const payload = (await listResponse.json()) as {
      stories: Array<{
        id: string;
        blockingStories: Array<{ id: string; title: string }>;
        blockedStories: Array<{ id: string; title: string }>;
      }>;
    };
    const backendStory = payload.stories.find((story) => {
      return story.id === blockingStory.story.id;
    });
    const frontendStory = payload.stories.find((story) => {
      return story.id === blockedStory.story.id;
    });

    expect(backendStory?.blockedStories).toEqual([
      { id: blockedStory.story.id, title: "Frontend UI" },
    ]);
    expect(frontendStory?.blockingStories).toEqual([
      { id: blockingStory.story.id, title: "Backend API" },
    ]);

    const unsetBlockerResponse = await fetchWithAuth(
      `${storyApiPath(projectId, String(blockedStory.story.storyNumber))}/blockers`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          relation: "blockedBy",
          targetStoryId: blockingStory.story.id,
        }),
      },
    );

    expect(unsetBlockerResponse.status).toBe(200);
    expect(await unsetBlockerResponse.json()).toEqual({
      story: expect.objectContaining({
        id: blockedStory.story.id,
        isBlocked: false,
        isBlocking: false,
        blockingStories: [],
        blockedStories: [],
      }),
      relatedStory: expect.objectContaining({
        id: blockingStory.story.id,
        isBlocked: false,
        isBlocking: false,
      }),
    });
  });

  it("updates status through all allowed states and records status timestamp", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Status flow",
        description: "Track status",
        storyPoint: 3,
      }),
    });
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number; statusChangedAt: string };
    };
    await assignStoryToIterationForTest(projectId, created.story.id);

    const statuses = ["Started", "Finished", "Delivered", "Accepted"];
    let latestTimestamp = created.story.statusChangedAt;

    for (const status of statuses) {
      const updateResponse = await fetchWithAuth(
        storyApiPath(projectId, String(created.story.storyNumber)),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );

      expect(updateResponse.status).toBe(200);
      const payload = (await updateResponse.json()) as {
        story: { status: string; statusChangedAt: string };
      };
      expect(payload.story.status).toBe(status);
      expect(typeof payload.story.statusChangedAt).toBe("string");
      latestTimestamp = payload.story.statusChangedAt;
    }

    const listResponse = await fetchWithAuth(
      `${storiesApiPath(projectId)}?status=Accepted`,
    );
    expect(listResponse.status).toBe(200);
    const listPayload = (await listResponse.json()) as {
      stories: Array<{ id: string; status: string; statusChangedAt: string }>;
    };
    expect(listPayload.stories).toHaveLength(1);
    expect(listPayload.stories[0]).toEqual(
      expect.objectContaining({
        id: created.story.id,
        status: "Accepted",
        statusChangedAt: latestTimestamp,
      }),
    );
  });

  it("auto-assigns current iteration when status is updated to Started", async () => {
    const projectId = await createProject();
    const currentIterationId = await ensureCurrentIterationForTest(projectId);

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Needs iteration",
        description: "Cannot start without iteration",
        storyPoint: 3,
      }),
    });
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const updateResponse = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "Started" }),
      },
    );

    expect(updateResponse.status).toBe(200);
    const payload = (await updateResponse.json()) as {
      story: { status: string; iterationId: string | null };
    };
    expect(payload.story.status).toBe("Started");
    expect(payload.story.iterationId).toBe(currentIterationId);
  });

  it("keeps current iteration when status is updated back to Unstarted", async () => {
    const projectId = await createProject();
    const currentIterationId = await ensureCurrentIterationForTest(projectId);

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Rollback to backlog",
        description: "Should return to backlog",
        storyPoint: 3,
      }),
    });
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const startResponse = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "Started" }),
      },
    );
    expect(startResponse.status).toBe(200);
    const startedPayload = (await startResponse.json()) as {
      story: { status: string; iterationId: string | null };
    };
    expect(startedPayload.story.status).toBe("Started");
    expect(startedPayload.story.iterationId).toBe(currentIterationId);

    const rollbackResponse = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "Unstarted" }),
      },
    );
    expect(rollbackResponse.status).toBe(200);
    const rollbackPayload = (await rollbackResponse.json()) as {
      story: { status: string; iterationId: string | null };
    };
    expect(rollbackPayload.story.status).toBe("Unstarted");
    expect(rollbackPayload.story.iterationId).toBe(currentIterationId);
  });

  it("clears non-current iteration when status is updated back to Unstarted", async () => {
    const projectId = await createProject();
    const currentIterationId = await ensureCurrentIterationForTest(projectId);
    const db = createDb(env.DB);
    const now = new Date().toISOString();
    const pastIterationId = `iter-past-${projectId}`;
    const existingNumbers = await db
      .select({ iterationNumber: iterationsTable.iterationNumber })
      .from(iterationsTable)
      .where(eq(iterationsTable.projectId, projectId))
      .all();
    const nextIterationNumber =
      existingNumbers.reduce(
        (max, row) => Math.max(max, row.iterationNumber),
        0,
      ) + 1;

    await db.insert(iterationsTable).values({
      id: pastIterationId,
      projectId,
      iterationNumber: nextIterationNumber,
      startDate: "2000-01-01",
      endDate: "2000-01-14",
      createdAt: now,
      updatedAt: now,
    });

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Rollback from past iteration",
        description: "Should clear non-current iteration",
        storyPoint: 3,
      }),
    });
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    await db
      .update(storiesTable)
      .set({ iterationId: pastIterationId, status: "Started" })
      .where(eq(storiesTable.id, created.story.id));

    const rollbackResponse = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "Unstarted" }),
      },
    );
    expect(rollbackResponse.status).toBe(200);
    const rollbackPayload = (await rollbackResponse.json()) as {
      story: { status: string; iterationId: string | null };
    };
    expect(rollbackPayload.story.status).toBe("Unstarted");
    expect(rollbackPayload.story.iterationId).toBeNull();
    expect(currentIterationId).not.toBe(pastIterationId);
  });

  it("bulk updates status for selected stories", async () => {
    const projectId = await createProject();

    const createFirst = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Bulk target one",
        description: "First",
        storyPoint: 3,
      }),
    });
    const createSecond = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Bulk target two",
        description: "Second",
        storyPoint: 3,
      }),
    });

    const first = (await createFirst.json()) as {
      story: { id: string; storyNumber: number };
    };
    const second = (await createSecond.json()) as {
      story: { id: string; storyNumber: number };
    };
    await assignStoryToIterationForTest(projectId, first.story.id);
    await assignStoryToIterationForTest(projectId, second.story.id);

    const response = await fetchWithAuth(storyBulkStatusApiPath(projectId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storyIds: [first.story.id, second.story.id],
        status: "Started",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stories: [
        expect.objectContaining({ id: first.story.id, status: "Started" }),
        expect.objectContaining({ id: second.story.id, status: "Started" }),
      ],
    });
  });

  it("bulk adds labels for selected stories", async () => {
    const projectId = await createProject();

    const createFirst = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Bulk label target one",
        description: "First",
      }),
    });
    const createSecond = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Bulk label target two",
        description: "Second",
      }),
    });

    const first = (await createFirst.json()) as {
      story: { id: string; storyNumber: number };
    };
    const second = (await createSecond.json()) as {
      story: { id: string; storyNumber: number };
    };

    const response = await fetchWithAuth(storyBulkLabelsApiPath(projectId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storyIds: [first.story.id, second.story.id],
        labels: ["backend"],
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stories: [
        expect.objectContaining({
          id: first.story.id,
          labels: ["backend"],
        }),
        expect.objectContaining({
          id: second.story.id,
          labels: ["backend"],
        }),
      ],
    });
  });

  it("allows direct status changes without transition guidance", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Forbidden transition",
        description: "Cannot jump directly",
      }),
    });
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const updateResponse = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "Accepted" }),
      },
    );

    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toEqual({
      story: expect.objectContaining({ status: "Accepted" }),
    });
  });

  it("allows rolling back Accepted story to Unstarted", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Accepted story",
        description: "Rollback target",
        status: "Accepted",
      }),
    });
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const updateResponse = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "Unstarted" }),
      },
    );

    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toEqual({
      story: expect.objectContaining({ status: "Unstarted" }),
    });
  });

  it("allows Accepted story to move directly to Delivered", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Accepted story",
        description: "Forbidden rollback target",
        status: "Accepted",
      }),
    });
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const updateResponse = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "Delivered" }),
      },
    );

    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toEqual({
      story: expect.objectContaining({ status: "Delivered" }),
    });
  });

  it("filters stories by status", async () => {
    const projectId = await createProject();

    await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "One",
        description: "Started",
        status: "Started",
      }),
    });
    await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Two",
        description: "Unstarted",
        status: "Unstarted",
      }),
    });

    const response = await fetchWithAuth(
      `${storiesApiPath(projectId)}?status=Started`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stories: [expect.objectContaining({ title: "One", status: "Started" })],
    });
  });

  it("filters stories by keyword across title, description, and labels", async () => {
    const projectId = await createProject();

    const createByTitle = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Search target title",
        description: "plain description",
        labels: [],
      }),
    });
    expect(createByTitle.status).toBe(201);

    const createByDescription = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Another story",
        description: "contains DESCNEEDLE in description",
        labels: [],
      }),
    });
    expect(createByDescription.status).toBe(201);

    const createByLabel = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Label matched story",
        description: "plain text",
        labels: ["keywordlabel"],
      }),
    });
    expect(createByLabel.status).toBe(201);

    const createNoMatch = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "No match",
        description: "irrelevant",
        labels: ["other"],
      }),
    });
    expect(createNoMatch.status).toBe(201);

    const titleResponse = await fetchWithAuth(
      `${storiesApiPath(projectId)}?q=target`,
    );
    expect(titleResponse.status).toBe(200);
    expect(await titleResponse.json()).toEqual({
      stories: [expect.objectContaining({ title: "Search target title" })],
    });

    const descriptionResponse = await fetchWithAuth(
      `${storiesApiPath(projectId)}?q=descneedle`,
    );
    expect(descriptionResponse.status).toBe(200);
    expect(await descriptionResponse.json()).toEqual({
      stories: [expect.objectContaining({ title: "Another story" })],
    });

    const labelResponse = await fetchWithAuth(
      `${storiesApiPath(projectId)}?q=keywordlabel`,
    );
    expect(labelResponse.status).toBe(200);
    expect(await labelResponse.json()).toEqual({
      stories: [expect.objectContaining({ title: "Label matched story" })],
    });
  });

  it("sets owners and requester, then filters by owner", async () => {
    const projectId = await createProject();

    const createOwned = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Owned story",
        description: "Assigned to current user",
        ownerIds: ["github|test-user"],
        requesterId: "github|test-user",
      }),
    });
    expect(createOwned.status).toBe(201);
    expect(await createOwned.json()).toEqual({
      story: expect.objectContaining({
        title: "Owned story",
        ownerIds: ["github|test-user"],
        requesterId: "github|test-user",
      }),
    });

    await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Unowned story",
        description: "No owner",
      }),
    });

    const response = await fetchWithAuth(
      `${storiesApiPath(projectId)}?owner=github|test-user`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stories: [expect.objectContaining({ title: "Owned story" })],
    });
  });

  it("returns My Work stories when myWork=true", async () => {
    const projectId = await createProject();

    await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "My owned story",
        description: "Mine",
        ownerIds: ["github|test-user"],
      }),
    });
    await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "No owner story",
        description: "Not mine",
      }),
    });

    const response = await fetchWithAuth(
      `${storiesApiPath(projectId)}?myWork=true`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stories: [expect.objectContaining({ title: "My owned story" })],
    });
  });

  it("returns total count in pagination metadata", async () => {
    const projectId = await createProject();

    for (const title of ["One", "Two", "Three"]) {
      const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description: `${title} description`,
        }),
      });
      expect(createResponse.status).toBe(201);
    }

    const response = await fetchWithAuth(
      `${storiesApiPath(projectId)}?limit=1&offset=0`,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      stories: Array<{ id: string }>;
      pagination: {
        limit: number;
        offset: number;
        hasNext: boolean;
        hasPrev: boolean;
        nextOffset: number | null;
        prevOffset: number | null;
        total: number;
        summary: {
          totalPoints: number;
          pointsByIterationId: Record<string, number>;
        };
      };
    };

    expect(payload.stories).toHaveLength(1);
    expect(payload.pagination).toEqual({
      limit: 1,
      offset: 0,
      hasNext: true,
      hasPrev: false,
      nextOffset: 1,
      prevOffset: null,
      total: 3,
      summary: {
        totalPoints: 0,
        pointsByIterationId: {},
      },
    });
  });

  it("returns 400 for invalid status filter", async () => {
    const projectId = await createProject();

    const response = await fetchWithAuth(
      `${storiesApiPath(projectId)}?status=Unknown`,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        "Story status must be Unstarted, Started, Finished, Delivered, or Accepted",
    });
  });

  it("deletes a story", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Temporary story",
        description: "This will be deleted",
      }),
    });
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const deleteResponse = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(204);

    const listResponse = await fetchWithAuth(storiesApiPath(projectId));
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({ stories: [] });
  });

  it("only returns stories that belong to the requested project", async () => {
    const projectId = await createProject();
    const otherProjectId = await createProject({
      sub: "github|other-user",
      email: "other@example.com",
    });

    await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Visible story",
        description: "Owned by current project",
      }),
    });

    await fetchWithAuth(
      storiesApiPath(otherProjectId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Other project story",
          description: "Should stay hidden",
        }),
      },
      {
        sub: "github|other-user",
        email: "other@example.com",
      },
    );

    const response = await fetchWithAuth(storiesApiPath(projectId));
    const payload = (await response.json()) as {
      stories: Array<{ title: string; projectId: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.stories).toEqual([
      expect.objectContaining({
        title: "Visible story",
        projectId,
      }),
    ]);
  });

  it("returns 403 when accessing another project's stories", async () => {
    const projectId = await createProject({
      sub: "github|other-user",
      email: "other@example.com",
    });

    const response = await fetchWithAuth(storiesApiPath(projectId));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error:
        "You do not have access to this project. Ask a project owner to invite you.",
    });
  });

  it("reorders stories within the project backlog", async () => {
    const projectId = await createProject();

    const createFirst = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "First",
        description: "First story",
      }),
    });
    const createSecond = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Second",
        description: "Second story",
      }),
    });
    const createThird = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Third",
        description: "Third story",
      }),
    });

    const first = (await createFirst.json()) as {
      story: { id: string; storyNumber: number };
    };
    const second = (await createSecond.json()) as {
      story: { id: string; storyNumber: number };
    };
    const third = (await createThird.json()) as {
      story: { id: string; storyNumber: number };
    };

    const reorderResponse = await fetchWithAuth(
      storyReorderApiPath(projectId),
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderedIds: [third.story.id, first.story.id, second.story.id],
        }),
      },
    );

    expect(reorderResponse.status).toBe(200);
    expect(await reorderResponse.json()).toEqual({
      stories: [
        expect.objectContaining({ id: third.story.id, position: 1 }),
        expect.objectContaining({ id: first.story.id, position: 2 }),
        expect.objectContaining({ id: second.story.id, position: 3 }),
      ],
    });

    const listResponse = await fetchWithAuth(storiesApiPath(projectId));
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      stories: [
        expect.objectContaining({ id: third.story.id, position: 1 }),
        expect.objectContaining({ id: first.story.id, position: 2 }),
        expect.objectContaining({ id: second.story.id, position: 3 }),
      ],
    });
  });

  it("inserts newly created Backlog story at the top without changing other panel orders", async () => {
    const projectId = await createProject();

    const createBacklogFirst = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Backlog first",
        description: "Existing backlog 1",
        status: "Unstarted",
      }),
    });
    const createBacklogSecond = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Backlog second",
        description: "Existing backlog 2",
        status: "Unstarted",
      }),
    });
    const createCurrentStarted = await fetchWithAuth(
      storiesApiPath(projectId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Current started",
          description: "Current panel item 1",
          status: "Started",
          storyPoint: 3,
        }),
      },
    );
    const createCurrentFinished = await fetchWithAuth(
      storiesApiPath(projectId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Current finished",
          description: "Current panel item 2",
          status: "Finished",
          storyPoint: 3,
        }),
      },
    );
    const createDone = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Done accepted",
        description: "Done panel item",
        status: "Accepted",
      }),
    });
    const createIcebox = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Icebox item",
        description: "Icebox panel item",
        status: "Unstarted",
        isIcebox: true,
      }),
    });
    const createIceboxNewest = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Icebox newest",
        description: "Newest icebox should be first",
        status: "Unstarted",
        isIcebox: true,
      }),
    });
    const createBacklogNewest = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Backlog newest",
        description: "New backlog should be first",
        status: "Unstarted",
      }),
    });

    expect(createBacklogFirst.status).toBe(201);
    expect(createBacklogSecond.status).toBe(201);
    expect(createCurrentStarted.status).toBe(201);
    expect(createCurrentFinished.status).toBe(201);
    expect(createDone.status).toBe(201);
    expect(createIcebox.status).toBe(201);
    expect(createIceboxNewest.status).toBe(201);
    expect(createBacklogNewest.status).toBe(201);

    const listResponse = await fetchWithAuth(storiesApiPath(projectId));
    expect(listResponse.status).toBe(200);

    const payload = (await listResponse.json()) as {
      stories: Array<{
        title: string;
        status: string;
        isIcebox: boolean;
      }>;
    };

    const backlogTitles = payload.stories
      .filter((story) => {
        return (
          story.status !== "Accepted" &&
          !["Started", "Finished", "Delivered"].includes(story.status) &&
          !story.isIcebox
        );
      })
      .map((story) => {
        return story.title;
      });
    const currentTitles = payload.stories
      .filter((story) => {
        return ["Started", "Finished", "Delivered"].includes(story.status);
      })
      .map((story) => {
        return story.title;
      });
    const doneTitles = payload.stories
      .filter((story) => {
        return story.status === "Accepted";
      })
      .map((story) => {
        return story.title;
      });
    const iceboxTitles = payload.stories
      .filter((story) => {
        return story.isIcebox;
      })
      .map((story) => {
        return story.title;
      });

    expect(backlogTitles).toEqual([
      "Backlog newest",
      "Backlog second",
      "Backlog first",
    ]);
    expect(currentTitles).toEqual(["Current started", "Current finished"]);
    expect(doneTitles).toEqual(["Done accepted"]);
    expect(iceboxTitles).toEqual(["Icebox newest", "Icebox item"]);
  });

  it("returns priority change history after reorder", async () => {
    const projectId = await createProject();

    const createFirst = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "A",
        description: "Story A",
      }),
    });
    const createSecond = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "B",
        description: "Story B",
      }),
    });

    const first = (await createFirst.json()) as {
      story: { id: string; storyNumber: number };
    };
    const second = (await createSecond.json()) as {
      story: { id: string; storyNumber: number };
    };

    const reorderResponse = await fetchWithAuth(
      storyReorderApiPath(projectId),
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderedIds: [first.story.id, second.story.id],
        }),
      },
    );
    expect(reorderResponse.status).toBe(200);

    const historyResponse = await fetchWithAuth(
      storyPriorityHistoryApiPath(projectId),
    );

    expect(historyResponse.status).toBe(200);
    expect(await historyResponse.json()).toEqual({
      history: [
        expect.objectContaining({
          __typename: "StoryPriorityHistory",
          id: expect.any(String),
          storyId: expect.any(String),
          fromPosition: expect.any(Number),
          toPosition: expect.any(Number),
          changedAt: expect.any(String),
        }),
        expect.objectContaining({
          __typename: "StoryPriorityHistory",
          id: expect.any(String),
          storyId: expect.any(String),
          fromPosition: expect.any(Number),
          toPosition: expect.any(Number),
          changedAt: expect.any(String),
        }),
      ],
    });
  });

  it("reorders a subset of stories (partial reorder)", async () => {
    const projectId = await createProject();

    const createFirst = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "First", description: "Story 1" }),
    });
    const createSecond = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Second", description: "Story 2" }),
    });
    const createThird = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Third", description: "Story 3" }),
    });

    const first = (await createFirst.json()) as {
      story: { id: string; storyNumber: number };
    };
    const second = (await createSecond.json()) as {
      story: { id: string; storyNumber: number };
    };
    const third = (await createThird.json()) as {
      story: { id: string; storyNumber: number };
    };

    // Reorder only first and third, leaving second untouched
    const reorderResponse = await fetchWithAuth(
      storyReorderApiPath(projectId),
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderedIds: [third.story.id, first.story.id],
        }),
      },
    );

    expect(reorderResponse.status).toBe(200);
    const result = (await reorderResponse.json()) as {
      stories: { id: string; position: number }[];
    };

    // Third should take first's position slot, first should take third's
    const thirdStory = result.stories.find((s) => s.id === third.story.id);
    const firstStory = result.stories.find((s) => s.id === first.story.id);
    const secondStory = result.stories.find((s) => s.id === second.story.id);
    expect(thirdStory!.position).toBe(1);
    expect(firstStory!.position).toBe(3);
    // Second story's position should be unchanged
    expect(secondStory!.position).toBe(2);
  });

  it("rejects reorder with non-existent story ID", async () => {
    const projectId = await createProject();

    await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Real", description: "Real story" }),
    });

    const reorderResponse = await fetchWithAuth(
      storyReorderApiPath(projectId),
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderedIds: ["non-existent-id"],
        }),
      },
    );

    expect(reorderResponse.status).toBe(400);
    expect(await reorderResponse.json()).toEqual({
      error: "Invalid story order",
    });
  });

  it("rejects reorder with duplicate IDs", async () => {
    const projectId = await createProject();

    const createFirst = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "First", description: "Story 1" }),
    });

    const first = (await createFirst.json()) as {
      story: { id: string; storyNumber: number };
    };

    const reorderResponse = await fetchWithAuth(
      storyReorderApiPath(projectId),
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderedIds: [first.story.id, first.story.id],
        }),
      },
    );

    expect(reorderResponse.status).toBe(400);
    expect(await reorderResponse.json()).toEqual({
      error: "Invalid story order",
    });
  });

  it("rejects non-integer story points", async () => {
    const projectId = await createProject();

    const response = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Invalid estimate",
        description: "Story point must be an integer",
        storyPoint: 1.5,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Story point must be a valid integer or null",
    });
  });

  it("rejects out-of-scale story point on create", async () => {
    const projectId = await createProject();

    const response = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Invalid estimate",
        description: "Story point must follow allowed scale",
        storyPoint: 21,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Story point must be a valid integer or null",
    });
  });

  it("rejects out-of-scale story point on update", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Scale-bound story",
        description: "Ready for update",
      }),
    });
    const created = (await createResponse.json()) as {
      story: { storyNumber: number };
    };

    const updateResponse = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyPoint: 21 }),
      },
    );

    expect(updateResponse.status).toBe(400);
    expect(await updateResponse.json()).toEqual({
      error: "Story point must be a valid integer or null",
    });
  });

  it("records story activities with actor and returns a merged timeline with comments", async () => {
    const projectId = await createProject({
      sub: "github|timeline-user",
      email: "timeline@example.com",
    });

    const createResponse = await fetchWithAuth(
      storiesApiPath(projectId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Timeline target",
          description: "Track changes",
        }),
      },
      {
        sub: "github|timeline-user",
        email: "timeline@example.com",
      },
    );
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };
    await assignStoryToIterationForTest(projectId, created.story.id);

    const updateResponse = await fetchWithAuth(
      storyApiPath(projectId, String(created.story.storyNumber)),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "Started",
          storyPoint: 3,
        }),
      },
      {
        sub: "github|timeline-user",
        email: "timeline@example.com",
      },
    );

    expect(updateResponse.status).toBe(200);

    const db = createDb(env.DB);
    await db.insert(storyTimelineEntriesTable).values({
      id: "comment-1",
      projectId,
      storyId: created.story.id,
      entryType: "comment",
      actorUserId: "github|comment-user",
      actorName: "commenter@example.com",
      action: null,
      fieldName: null,
      oldValue: null,
      newValue: null,
      body: "Need QA confirmation",
      createdAt: "2026-03-27T10:00:00.000Z",
      updatedAt: "2026-03-27T10:00:00.000Z",
    });

    const timelineResponse = await fetchWithAuth(
      storyTimelineApiPath(projectId, String(created.story.storyNumber)),
      {},
      {
        sub: "github|timeline-user",
        email: "timeline@example.com",
      },
    );

    expect(timelineResponse.status).toBe(200);
    const payload = (await timelineResponse.json()) as {
      timeline: unknown[];
      hasMore: boolean;
      nextCursor: string | null;
    };
    expect(payload.hasMore).toBe(false);
    expect(payload.nextCursor).toBeNull();
    expect(payload.timeline).toHaveLength(4);
    expect(payload.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          __typename: "StoryTimelineActivityEntry",
          entryType: "activity",
          actorName: "timeline@example.com",
          action: "created",
          fieldName: "story",
          oldValue: null,
          newValue: "Timeline target",
        }),
        expect.objectContaining({
          __typename: "StoryTimelineCommentEntry",
          entryType: "comment",
          actorName: "commenter@example.com",
          body: "Need QA confirmation",
        }),
        expect.objectContaining({
          __typename: "StoryTimelineActivityEntry",
          entryType: "activity",
          actorName: "timeline@example.com",
          fieldName: "storyPoint",
          oldValue: null,
          newValue: "3",
        }),
        expect.objectContaining({
          __typename: "StoryTimelineActivityEntry",
          entryType: "activity",
          actorName: "timeline@example.com",
          fieldName: "status",
          oldValue: "Unstarted",
          newValue: "Started",
        }),
      ]),
    );
  });

  it("rejects invalid story timeline cursor", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Cursor story", description: "x" }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const timelineResponse = await fetchWithAuth(
      `${storyTimelineApiPath(projectId, String(created.story.storyNumber))}?before=not-a-cursor`,
    );
    expect(timelineResponse.status).toBe(400);
  });

  it("pages story timeline with stable ordering", async () => {
    const projectId = await createProject();

    const createResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Paged story", description: "x" }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };
    const storyId = created.story.id;
    const storyNumber = String(created.story.storyNumber);

    const db = createDb(env.DB);
    await db
      .delete(storyTimelineEntriesTable)
      .where(
        and(
          eq(storyTimelineEntriesTable.projectId, projectId),
          eq(storyTimelineEntriesTable.storyId, storyId),
        ),
      );

    const baseMs = Date.now() + 120_000;
    const at = (deltaSeconds: number) =>
      new Date(baseMs + deltaSeconds * 1000).toISOString();

    const baseEntry = {
      projectId,
      storyId,
      entryType: "comment" as const,
      actorUserId: "github|u1",
      actorName: "user@example.com",
      action: null as string | null,
      fieldName: null as string | null,
      oldValue: null as string | null,
      newValue: null as string | null,
      body: "x",
    };

    await db.insert(storyTimelineEntriesTable).values([
      {
        ...baseEntry,
        id: "tl-t1",
        body: "1",
        createdAt: at(1),
        updatedAt: at(1),
      },
      {
        ...baseEntry,
        id: "tl-t2",
        body: "2",
        createdAt: at(2),
        updatedAt: at(2),
      },
      {
        ...baseEntry,
        id: "tl-t3",
        body: "3",
        createdAt: at(3),
        updatedAt: at(3),
      },
      {
        ...baseEntry,
        id: "tl-t4",
        body: "4",
        createdAt: at(4),
        updatedAt: at(4),
      },
    ]);

    const first = await fetchWithAuth(
      `${storyTimelineApiPath(projectId, storyNumber)}?limit=2`,
    );
    expect(first.status).toBe(200);
    const page1 = (await first.json()) as {
      timeline: Array<{ id: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };
    expect(page1.timeline.map((row) => row.id)).toEqual(["tl-t3", "tl-t4"]);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).not.toBeNull();

    const second = await fetchWithAuth(
      `${storyTimelineApiPath(projectId, storyNumber)}?limit=2&before=${encodeURIComponent(page1.nextCursor ?? "")}`,
    );
    expect(second.status).toBe(200);
    const page2 = (await second.json()) as {
      timeline: Array<{ id: string }>;
      hasMore: boolean;
    };
    expect(page2.timeline.map((row) => row.id)).toEqual(["tl-t1", "tl-t2"]);
    expect(page2.hasMore).toBe(false);
  });

  it("uploads attachments, lists previews, downloads, and deletes", async () => {
    const projectId = await createProject();

    const createStoryResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Attachment Story",
        description: "Story for file attachments",
      }),
    });
    const createdStory = (await createStoryResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const uploadFormData = new FormData();
    uploadFormData.set(
      "file",
      new File(["hello image"], "mock.png", { type: "image/png" }),
    );

    const uploadResponse = await fetchWithAuth(
      storyAttachmentsApiPath(
        projectId,
        String(createdStory.story.storyNumber),
      ),
      {
        method: "POST",
        body: uploadFormData,
      },
    );
    expect(uploadResponse.status).toBe(201);
    const uploadedPayload = (await uploadResponse.json()) as {
      attachment: {
        id: string;
        fileName: string;
        mimeType: string;
        fileSize: number;
      };
    };
    expect(uploadedPayload.attachment.fileName).toBe("mock.png");
    expect(uploadedPayload.attachment.mimeType).toBe("image/png");
    expect(uploadedPayload.attachment.fileSize).toBeGreaterThan(0);

    const listResponse = await fetchWithAuth(
      storyAttachmentsApiPath(
        projectId,
        String(createdStory.story.storyNumber),
      ),
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      attachments: [
        expect.objectContaining({
          __typename: "StoryAttachment",
          id: uploadedPayload.attachment.id,
          storyId: createdStory.story.id,
          fileName: "mock.png",
          mimeType: "image/png",
        }),
      ],
    });

    const contentResponse = await fetchWithAuth(
      storyAttachmentContentApiPath(
        projectId,
        String(createdStory.story.storyNumber),
        uploadedPayload.attachment.id,
      ),
    );
    expect(contentResponse.status).toBe(200);
    expect(contentResponse.headers.get("content-type")).toBe("image/png");
    expect(contentResponse.headers.get("x-content-type-options")).toBe(
      "nosniff",
    );
    expect(contentResponse.headers.get("content-disposition")).toContain(
      "inline",
    );
    const contentBytes = new Uint8Array(await contentResponse.arrayBuffer());
    expect(new TextDecoder().decode(contentBytes)).toBe("hello image");

    const downloadResponse = await fetchWithAuth(
      `${storyAttachmentContentApiPath(
        projectId,
        String(createdStory.story.storyNumber),
        uploadedPayload.attachment.id,
      )}?download=1`,
    );
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("content-disposition")).toContain(
      "attachment",
    );

    const deleteResponse = await fetchWithAuth(
      `${storyAttachmentsApiPath(projectId, String(createdStory.story.storyNumber))}/${uploadedPayload.attachment.id}`,
      {
        method: "DELETE",
      },
    );
    expect(deleteResponse.status).toBe(204);

    const listAfterDelete = await fetchWithAuth(
      storyAttachmentsApiPath(
        projectId,
        String(createdStory.story.storyNumber),
      ),
    );
    expect(listAfterDelete.status).toBe(200);
    expect(await listAfterDelete.json()).toEqual({ attachments: [] });
  });

  it("rejects attachment uploads with disallowed mime types", async () => {
    const projectId = await createProject();

    const createStoryResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "SVG attachment story",
        description: "No SVG uploads",
      }),
    });
    const createdStory = (await createStoryResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const uploadFormData = new FormData();
    uploadFormData.set(
      "file",
      new File(["<svg />"], "vector.svg", { type: "image/svg+xml" }),
    );

    const uploadResponse = await fetchWithAuth(
      storyAttachmentsApiPath(
        projectId,
        String(createdStory.story.storyNumber),
      ),
      {
        method: "POST",
        body: uploadFormData,
      },
    );
    expect(uploadResponse.status).toBe(400);
  });

  it("rejects attachment uploads that exceed the size limit", async () => {
    const projectId = await createProject();

    const createStoryResponse = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Large attachment story",
        description: "Too big",
      }),
    });
    const createdStory = (await createStoryResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const largeBytes = new Uint8Array(10 * 1024 * 1024 + 1);
    const uploadFormData = new FormData();
    uploadFormData.set(
      "file",
      new File([largeBytes], "big.png", { type: "image/png" }),
    );

    const uploadResponse = await fetchWithAuth(
      storyAttachmentsApiPath(
        projectId,
        String(createdStory.story.storyNumber),
      ),
      {
        method: "POST",
        body: uploadFormData,
      },
    );
    expect(uploadResponse.status).toBe(413);
  });

  // Comment CRUD tests

  function storyCommentsApiPath(projectId: string, storyId: string): string {
    return `${storiesApiPath(projectId)}/${storyId}/comments`;
  }

  function storyCommentApiPath(
    projectId: string,
    storyId: string,
    commentId: string,
  ): string {
    return `${storyCommentsApiPath(projectId, storyId)}/${commentId}`;
  }

  it("creates, updates, and deletes a comment on a story", async () => {
    const projectId = await createProject({
      sub: "github|comment-author",
      email: "author@example.com",
    });

    const createStoryRes = await fetchWithAuth(
      storiesApiPath(projectId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Commentable story",
          description: "A story to comment on",
        }),
      },
      { sub: "github|comment-author", email: "author@example.com" },
    );
    const story = (await createStoryRes.json()) as {
      story: { id: string; storyNumber: number };
    };

    // Create comment
    const createRes = await fetchWithAuth(
      storyCommentsApiPath(projectId, String(story.story.storyNumber)),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "First comment" }),
      },
      { sub: "github|comment-author", email: "author@example.com" },
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      comment: { id: string; body: string; actorName: string };
    };
    expect(created.comment.body).toBe("First comment");
    expect(created.comment.actorName).toBe("author@example.com");

    // Update comment
    const updateRes = await fetchWithAuth(
      storyCommentApiPath(
        projectId,
        String(story.story.storyNumber),
        created.comment.id,
      ),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "Updated comment" }),
      },
      { sub: "github|comment-author", email: "author@example.com" },
    );
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as {
      comment: { body: string };
    };
    expect(updated.comment.body).toBe("Updated comment");

    // Delete comment
    const deleteRes = await fetchWithAuth(
      storyCommentApiPath(
        projectId,
        String(story.story.storyNumber),
        created.comment.id,
      ),
      { method: "DELETE" },
      { sub: "github|comment-author", email: "author@example.com" },
    );
    expect(deleteRes.status).toBe(204);
  });

  it("rejects empty comment body", async () => {
    const projectId = await createProject();
    const createStoryRes = await fetchWithAuth(storiesApiPath(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Story", description: "Desc" }),
    });
    const story = (await createStoryRes.json()) as {
      story: { id: string; storyNumber: number };
    };

    const res = await fetchWithAuth(
      storyCommentsApiPath(projectId, String(story.story.storyNumber)),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "" }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("forbids editing or deleting another user's comment", async () => {
    const projectId = await createProject({
      sub: "github|user-a",
      email: "a@example.com",
    });

    // Add another member
    await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/members`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "b@example.com", role: "member" }),
      },
      { sub: "github|user-a", email: "a@example.com" },
    );

    const storyRes = await fetchWithAuth(
      storiesApiPath(projectId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Story", description: "Desc" }),
      },
      { sub: "github|user-a", email: "a@example.com" },
    );
    const story = (await storyRes.json()) as {
      story: { id: string; storyNumber: number };
    };

    // User A creates a comment
    const createRes = await fetchWithAuth(
      storyCommentsApiPath(projectId, String(story.story.storyNumber)),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "User A comment" }),
      },
      { sub: "github|user-a", email: "a@example.com" },
    );
    const comment = (await createRes.json()) as {
      comment: { id: string };
    };

    // User B tries to edit
    const editRes = await fetchWithAuth(
      storyCommentApiPath(
        projectId,
        String(story.story.storyNumber),
        comment.comment.id,
      ),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "Hacked comment" }),
      },
      { sub: "github|user-b", email: "b@example.com" },
    );
    expect(editRes.status).toBe(403);

    // User B tries to delete
    const deleteRes = await fetchWithAuth(
      storyCommentApiPath(
        projectId,
        String(story.story.storyNumber),
        comment.comment.id,
      ),
      { method: "DELETE" },
      { sub: "github|user-b", email: "b@example.com" },
    );
    expect(deleteRes.status).toBe(403);
  });
});
