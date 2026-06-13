import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/infrastructure/db/client";
import { projectMembersTable } from "../src/infrastructure/db/schema/project-members";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";

function sessionsApiPath(projectId: string): string {
  return `http://localhost/api/projects/${projectId}/planning-poker/sessions`;
}

function sessionApiPath(projectId: string, sessionId: string): string {
  return `${sessionsApiPath(projectId)}/${sessionId}`;
}

function votesApiPath(projectId: string, sessionId: string): string {
  return `${sessionApiPath(projectId, sessionId)}/votes`;
}

function revealApiPath(projectId: string, sessionId: string): string {
  return `${sessionApiPath(projectId, sessionId)}/reveal`;
}

function applyApiPath(projectId: string, sessionId: string): string {
  return `${sessionApiPath(projectId, sessionId)}/apply`;
}

function closeApiPath(projectId: string, sessionId: string): string {
  return `${sessionApiPath(projectId, sessionId)}/close`;
}

function resetApiPath(projectId: string, sessionId: string): string {
  return `${sessionApiPath(projectId, sessionId)}/reset`;
}

describe("planning poker routes", () => {
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

  const createProject = async (
    overrides?: Parameters<typeof createAuthHeaders>[0],
  ) => {
    const response = await fetchWithAuth(
      "http://localhost/api/projects",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Planning Poker Project" }),
      },
      overrides,
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { project: { id: string } };
    return payload.project.id;
  };

  const createStory = async (
    projectId: string,
    overrides?: Parameters<typeof createAuthHeaders>[0],
  ) => {
    const response = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/stories`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Estimate me",
          description: "planning poker target",
        }),
      },
      overrides,
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { story: { id: string } };
    return payload.story.id;
  };

  const addProjectMember = async (projectId: string, userId: string) => {
    const db = createDb(env.DB);
    const now = new Date().toISOString();
    await db.insert(projectMembersTable).values({
      projectId,
      userId,
      role: "member",
      createdAt: now,
      updatedAt: now,
    });
  };

  it("supports start, vote, reveal, and apply flow", async () => {
    const ownerUserId = "github|owner";
    const memberUserId = "github|member";

    const ownerAuth = { sub: ownerUserId, email: "owner@example.com" };
    const memberAuth = { sub: memberUserId, email: "member@example.com" };

    const projectId = await createProject(ownerAuth);
    const storyId = await createStory(projectId, ownerAuth);
    await addProjectMember(projectId, memberUserId);

    const startResponse = await fetchWithAuth(
      sessionsApiPath(projectId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId }),
      },
      ownerAuth,
    );
    expect(startResponse.status).toBe(201);
    const startPayload = (await startResponse.json()) as {
      session: { id: string; status: string; storyId: string };
    };
    expect(startPayload.session.storyId).toBe(storyId);
    expect(startPayload.session.status).toBe("Open");
    const sessionId = startPayload.session.id;

    const ownerVote = await fetchWithAuth(
      votesApiPath(projectId, sessionId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ point: 3 }),
      },
      ownerAuth,
    );
    expect(ownerVote.status).toBe(200);

    const memberVote = await fetchWithAuth(
      votesApiPath(projectId, sessionId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ point: 5 }),
      },
      memberAuth,
    );
    expect(memberVote.status).toBe(200);

    const beforeReveal = await fetchWithAuth(
      sessionApiPath(projectId, sessionId),
      {},
      ownerAuth,
    );
    expect(beforeReveal.status).toBe(200);
    const beforePayload = (await beforeReveal.json()) as {
      session: { votes: Array<{ userId: string; point: number | null }> };
    };
    const ownerVisibleBefore = beforePayload.session.votes.find(
      (vote) => vote.userId === ownerUserId,
    );
    const memberHiddenBefore = beforePayload.session.votes.find(
      (vote) => vote.userId === memberUserId,
    );
    expect(ownerVisibleBefore?.point).toBeNull();
    expect(memberHiddenBefore?.point).toBeNull();

    const revealResponse = await fetchWithAuth(
      revealApiPath(projectId, sessionId),
      { method: "POST" },
      ownerAuth,
    );
    expect(revealResponse.status).toBe(200);

    const afterReveal = await fetchWithAuth(
      sessionApiPath(projectId, sessionId),
      {},
      ownerAuth,
    );
    const afterPayload = (await afterReveal.json()) as {
      session: {
        status: string;
        votes: Array<{ userId: string; point: number | null }>;
      };
    };
    expect(afterPayload.session.status).toBe("Revealed");
    const ownerVisibleAfter = afterPayload.session.votes.find(
      (vote) => vote.userId === ownerUserId,
    );
    const memberVisibleAfter = afterPayload.session.votes.find(
      (vote) => vote.userId === memberUserId,
    );
    expect(ownerVisibleAfter?.point).toBe(3);
    expect(memberVisibleAfter?.point).toBe(5);

    const applyResponse = await fetchWithAuth(
      applyApiPath(projectId, sessionId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyPoint: 5 }),
      },
      ownerAuth,
    );
    expect(applyResponse.status).toBe(200);
    const applyPayload = (await applyResponse.json()) as {
      session: { status: string; consensusPoint: number | null };
      story: { id: string; storyPoint: number | null };
    };
    expect(applyPayload.session.status).toBe("Closed");
    expect(applyPayload.session.consensusPoint).toBe(5);
    expect(applyPayload.story.id).toBe(storyId);
    expect(applyPayload.story.storyPoint).toBe(5);
  });

  it("supports reset after reveal and close session", async () => {
    const ownerAuth = { sub: "github|owner", email: "owner@example.com" };
    const memberAuth = { sub: "github|member", email: "member@example.com" };

    const projectId = await createProject(ownerAuth);
    const storyId = await createStory(projectId, ownerAuth);
    await addProjectMember(projectId, "github|member");

    const startResponse = await fetchWithAuth(
      sessionsApiPath(projectId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId }),
      },
      ownerAuth,
    );
    const startPayload = (await startResponse.json()) as {
      session: { id: string };
    };
    const sessionId = startPayload.session.id;

    await fetchWithAuth(
      votesApiPath(projectId, sessionId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ point: 2 }),
      },
      ownerAuth,
    );
    await fetchWithAuth(
      votesApiPath(projectId, sessionId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ point: 8 }),
      },
      memberAuth,
    );

    const revealResponse = await fetchWithAuth(
      revealApiPath(projectId, sessionId),
      { method: "POST" },
      ownerAuth,
    );
    expect(revealResponse.status).toBe(200);

    const resetResponse = await fetchWithAuth(
      resetApiPath(projectId, sessionId),
      { method: "POST" },
      ownerAuth,
    );
    expect(resetResponse.status).toBe(200);
    const resetPayload = (await resetResponse.json()) as {
      session: { status: string; totalVotes: number };
    };
    expect(resetPayload.session.status).toBe("Open");
    expect(resetPayload.session.totalVotes).toBe(0);

    const closeResponse = await fetchWithAuth(
      closeApiPath(projectId, sessionId),
      { method: "POST" },
      ownerAuth,
    );
    expect(closeResponse.status).toBe(200);

    const activeAfterClose = await fetchWithAuth(
      `${sessionsApiPath(projectId)}/active`,
      {},
      ownerAuth,
    );
    expect(activeAfterClose.status).toBe(200);
    const activePayload = (await activeAfterClose.json()) as {
      session: unknown | null;
    };
    expect(activePayload.session).toBeNull();
  });

  it("supports replacing active session with another story", async () => {
    const ownerAuth = { sub: "github|owner", email: "owner@example.com" };
    const projectId = await createProject(ownerAuth);
    const firstStoryId = await createStory(projectId, ownerAuth);
    const secondStoryId = await createStory(projectId, ownerAuth);

    const startFirst = await fetchWithAuth(
      sessionsApiPath(projectId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId: firstStoryId }),
      },
      ownerAuth,
    );
    expect(startFirst.status).toBe(201);

    const replaceStart = await fetchWithAuth(
      sessionsApiPath(projectId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId: secondStoryId, replaceActive: true }),
      },
      ownerAuth,
    );
    expect(replaceStart.status).toBe(201);
    const replacePayload = (await replaceStart.json()) as {
      session: { storyId: string; status: string };
    };
    expect(replacePayload.session.storyId).toBe(secondStoryId);
    expect(replacePayload.session.status).toBe("Open");
  });
});
