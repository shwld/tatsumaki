import { SELF, env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { createDb } from "../src/infrastructure/db/client";
import { iterationsTable } from "../src/infrastructure/db/schema/iterations";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";

type ClientRegistrationResponse = {
  client_id?: string;
};

type TokenResponse = {
  access_token?: string;
};

describe("MCP OAuth", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
    await clearOAuthKv();
  });

  it("exposes OAuth metadata and challenges unauthenticated MCP requests", async () => {
    const metadataResponse = await SELF.fetch(
      "http://localhost/.well-known/oauth-authorization-server",
    );

    expect(metadataResponse.status).toBe(200);
    await expect(metadataResponse.json()).resolves.toMatchObject({
      issuer: "http://localhost",
      authorization_endpoint: "http://localhost/oauth/authorize",
      token_endpoint: "http://localhost/oauth/token",
      registration_endpoint: "http://localhost/oauth/register",
      scopes_supported: ["mcp"],
      code_challenge_methods_supported: ["S256"],
    });

    const protectedResourceResponse = await SELF.fetch(
      "http://localhost/.well-known/oauth-protected-resource",
    );

    expect(protectedResourceResponse.status).toBe(200);
    await expect(protectedResourceResponse.json()).resolves.toMatchObject({
      resource: "http://localhost/programmatic-api/mcp",
      authorization_servers: ["http://localhost"],
      scopes_supported: ["mcp"],
    });

    const response = await SELF.fetch("http://localhost/programmatic-api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "tools",
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `resource_metadata="http://localhost/.well-known/oauth-protected-resource/programmatic-api/mcp"`,
    );
  });

  it("authorizes via Access and scopes list_stories to the authenticated user", async () => {
    const ownProjectId = await createProject("Alpha Project");
    await createStory(ownProjectId, "Visible story");

    const otherProjectId = await createProject("Hidden Project", {
      sub: "github|other-user",
      email: "other@example.com",
    });
    await createStory(otherProjectId, "Hidden story", {
      authOverrides: {
        sub: "github|other-user",
        email: "other@example.com",
      },
    });

    const accessToken = await issueMcpAccessToken();

    const toolsListResponse = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "tools",
      method: "tools/list",
      params: {},
    });

    expect(toolsListResponse.status).toBe(200);

    const ownStoriesResponse = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "own-stories",
      method: "tools/call",
      params: {
        name: "list_stories",
        arguments: {
          projectId: ownProjectId,
        },
      },
    });

    expect(ownStoriesResponse.status).toBe(200);
    const ownStoriesPayload = (await parseMcpResult(ownStoriesResponse)) as {
      result?: {
        content?: Array<{ text?: string }>;
      };
    };
    const ownStoriesText = ownStoriesPayload.result?.content?.[0]?.text;
    expect(ownStoriesText).toBeTruthy();
    expect(JSON.parse(ownStoriesText ?? "")).toEqual({
      stories: [
        expect.objectContaining({
          title: "Visible story",
          status: "Unstarted",
          isIcebox: false,
          storyPoint: null,
          type: "feature",
        }),
      ],
    });

    const hiddenStoriesResponse = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "hidden-stories",
      method: "tools/call",
      params: {
        name: "list_stories",
        arguments: {
          projectId: otherProjectId,
        },
      },
    });

    expect(hiddenStoriesResponse.status).toBe(200);
    const hiddenStoriesPayload = (await parseMcpResult(
      hiddenStoriesResponse,
    )) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(hiddenStoriesPayload.result?.isError).toBe(true);
    expect(hiddenStoriesPayload.result?.content?.[0]?.text).toContain(
      "You do not have access to this project.",
    );
  });

  it("creates a story through create_story and returns the created story details", async () => {
    const projectId = await createProject("Story Project");
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "create-story",
      method: "tools/call",
      params: {
        name: "create_story",
        arguments: {
          projectId,
          title: "Add MCP creation",
          type: "feature",
          description: "Create a story from an MCP client",
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).not.toBe(true);

    const text = payload.result?.content?.[0]?.text;
    expect(text).toBeTruthy();
    expect(JSON.parse(text ?? "")).toEqual({
      story: {
        id: expect.any(String),
        storyNumber: 1,
        title: "Add MCP creation",
        status: "Unstarted",
        isIcebox: false,
        storyPoint: null,
        type: "feature",
      },
    });

    const storiesResponse = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "list-created-story",
      method: "tools/call",
      params: {
        name: "list_stories",
        arguments: { projectId },
      },
    });
    const storiesPayload = (await parseMcpResult(storiesResponse)) as {
      result?: {
        content?: Array<{ text?: string }>;
      };
    };
    expect(JSON.parse(storiesPayload.result?.content?.[0]?.text ?? "")).toEqual(
      {
        stories: [
          expect.objectContaining({
            title: "Add MCP creation",
            description: "Create a story from an MCP client",
            status: "Unstarted",
            isIcebox: false,
            storyPoint: null,
            type: "feature",
          }),
        ],
      },
    );
  });

  it("creates a release story through create_story", async () => {
    const projectId = await createProject("Release Story Project");
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "create-release-story",
      method: "tools/call",
      params: {
        name: "create_story",
        arguments: {
          projectId,
          title: "Ship v1",
          type: "release",
          description: "Release marker",
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };

    expect(payload.result?.isError).not.toBe(true);
    expect(JSON.parse(payload.result?.content?.[0]?.text ?? "")).toEqual({
      story: expect.objectContaining({
        title: "Ship v1",
        status: "Unstarted",
        storyPoint: null,
        type: "release",
      }),
    });
  });

  it("returns MCP tool errors when create_story input is invalid", async () => {
    const projectId = await createProject("Validation Project");
    const accessToken = await issueMcpAccessToken();

    const missingTitleResponse = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "missing-title",
      method: "tools/call",
      params: {
        name: "create_story",
        arguments: {
          projectId,
          type: "feature",
          description: "Missing title",
        },
      },
    });

    expect(missingTitleResponse.status).toBe(200);
    const missingTitlePayload = (await parseMcpResult(
      missingTitleResponse,
    )) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(missingTitlePayload.result?.isError).toBe(true);
    expect(missingTitlePayload.result?.content?.[0]?.text).toContain(
      "Story title is required",
    );

    const invalidTypeResponse = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "invalid-type",
      method: "tools/call",
      params: {
        name: "create_story",
        arguments: {
          projectId,
          title: "Bad story type",
          type: "spike",
          description: "Still invalid",
        },
      },
    });

    expect(invalidTypeResponse.status).toBe(200);
    const invalidTypePayload = (await parseMcpResult(invalidTypeResponse)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(invalidTypePayload.result?.isError).toBe(true);
    expect(invalidTypePayload.result?.content?.[0]?.text).toContain(
      "Story type must be feature, bug, chore, or release",
    );
  });

  it("authorizes CLI v1 endpoint with OAuth bearer token", async () => {
    const accessToken = await issueAccessTokenForResource(
      "http://localhost/programmatic-api/v1",
    );

    const response = await SELF.fetch(
      "http://localhost/programmatic-api/v1/version",
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      apiVersion: expect.any(String),
      minClientVersion: expect.any(String),
    });
  });

  it("reorders stories through reorder_stories and returns stories in updated priority order", async () => {
    const projectId = await createProject("Reorder Project");
    const firstStoryId = await createStory(projectId, "First story");
    await createStory(projectId, "Second story");
    const thirdStoryId = await createStory(projectId, "Third story");
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "reorder-stories",
      method: "tools/call",
      params: {
        name: "reorder_stories",
        arguments: {
          projectId,
          orderedIds: [firstStoryId, thirdStoryId],
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).not.toBe(true);
    expect(JSON.parse(payload.result?.content?.[0]?.text ?? "")).toEqual({
      stories: [
        expect.objectContaining({
          id: firstStoryId,
          title: "First story",
        }),
        expect.objectContaining({
          title: "Second story",
        }),
        expect.objectContaining({
          id: thirdStoryId,
          title: "Third story",
        }),
      ],
    });
  });

  it("returns an error when reorder_stories receives invalid orderedIds", async () => {
    const projectId = await createProject("Invalid Reorder Project");
    const storyId = await createStory(projectId, "Single story");
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "invalid-reorder-stories",
      method: "tools/call",
      params: {
        name: "reorder_stories",
        arguments: {
          projectId,
          orderedIds: [storyId, storyId],
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).toBe(true);
    expect(payload.result?.content?.[0]?.text).toContain("Invalid story order");
  });

  it("updates a story status through update_story_status and returns the updated story", async () => {
    const projectId = await createProject("Status Project");
    const storyId = await createStory(projectId, "Ship status update", {
      storyPoint: 3,
    });
    const { startDate, endDate } = buildCurrentIterationWindow();
    const currentIterationId = await insertIteration(
      projectId,
      startDate,
      endDate,
    );
    await assignStoryToIteration(projectId, currentIterationId, storyId);
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "update-story-status",
      method: "tools/call",
      params: {
        name: "update_story_status",
        arguments: {
          projectId,
          storyId,
          status: "Started",
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).not.toBe(true);
    expect(JSON.parse(payload.result?.content?.[0]?.text ?? "")).toEqual({
      story: {
        id: storyId,
        storyNumber: 1,
        title: "Ship status update",
        status: "Started",
        isIcebox: false,
        storyPoint: 3,
        type: "feature",
      },
    });
  });

  it("updates story status directly when update_story_status jumps ahead", async () => {
    const projectId = await createProject("Invalid Transition Project");
    const storyId = await createStory(projectId, "Skip ahead", {
      storyPoint: 5,
    });
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "invalid-update-story-status",
      method: "tools/call",
      params: {
        name: "update_story_status",
        arguments: {
          projectId,
          storyId,
          status: "Delivered",
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).not.toBe(true);
    expect(JSON.parse(payload.result?.content?.[0]?.text ?? "")).toEqual({
      story: expect.objectContaining({
        id: storyId,
        status: "Delivered",
      }),
    });
  });

  it("returns an estimate-required error when update_story_status starts an unestimated feature", async () => {
    const projectId = await createProject("Estimate Required Project");
    const storyId = await createStory(projectId, "Estimate me first");
    const { startDate, endDate } = buildCurrentIterationWindow();
    const currentIterationId = await insertIteration(
      projectId,
      startDate,
      endDate,
    );
    await assignStoryToIteration(projectId, currentIterationId, storyId);
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "estimate-required",
      method: "tools/call",
      params: {
        name: "update_story_status",
        arguments: {
          projectId,
          storyId,
          status: "Started",
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).toBe(true);
    expect(payload.result?.content?.[0]?.text).toContain(
      "Cannot change status to Started without an estimate.",
    );
  });

  it("gets a single story through get_story and returns its details", async () => {
    const projectId = await createProject("Get Story Project");
    const storyId = await createStory(projectId, "Fetch me", {
      storyPoint: 2,
    });
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "get-story",
      method: "tools/call",
      params: {
        name: "get_story",
        arguments: {
          projectId,
          storyId,
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).not.toBe(true);
    expect(JSON.parse(payload.result?.content?.[0]?.text ?? "")).toEqual({
      story: {
        id: storyId,
        storyNumber: 1,
        title: "Fetch me",
        description: "Fetch me description",
        status: "Unstarted",
        isIcebox: false,
        storyPoint: 2,
        type: "feature",
        labels: [],
      },
    });
  });

  it("gets a story through get_story using storyNumber instead of storyId", async () => {
    const projectId = await createProject("Story Number Lookup Project");
    const storyId = await createStory(projectId, "Look me up by number");
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "get-story-by-number",
      method: "tools/call",
      params: {
        name: "get_story",
        arguments: {
          projectId,
          storyNumber: "#1",
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).not.toBe(true);
    expect(JSON.parse(payload.result?.content?.[0]?.text ?? "")).toEqual({
      story: {
        id: storyId,
        storyNumber: 1,
        title: "Look me up by number",
        description: "Look me up by number description",
        status: "Unstarted",
        isIcebox: false,
        storyPoint: null,
        type: "feature",
        labels: [],
      },
    });
  });

  it("returns an error when get_story is called with a non-existent storyNumber", async () => {
    const projectId = await createProject("Missing Story Number Project");
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "get-missing-story-number",
      method: "tools/call",
      params: {
        name: "get_story",
        arguments: {
          projectId,
          storyNumber: 999,
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).toBe(true);
    expect(payload.result?.content?.[0]?.text).toContain(
      "Story not found for storyNumber 999.",
    );
  });

  it("fetches project information via get_project", async () => {
    const projectId = await createProject("My Team Project");
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "get-project",
      method: "tools/call",
      params: {
        name: "get_project",
        arguments: { projectId },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).not.toBe(true);

    const text = payload.result?.content?.[0]?.text;
    expect(text).toBeTruthy();
    expect(JSON.parse(text ?? "")).toEqual({
      project: {
        id: projectId,
        name: "My Team Project",
        sprintDurationDays: 14,
        pointScaleType: "fibonacci",
        customPointScale: null,
        estimateBugs: true,
        estimateChores: true,
        iterationStartDay: 1,
        currentUserRole: "owner",
      },
    });
  });

  it("returns access denied when get_project is called for a non-member project", async () => {
    const otherProjectId = await createProject("Other Project", {
      sub: "github|other-user",
      email: "other@example.com",
    });
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "get-project-denied",
      method: "tools/call",
      params: {
        name: "get_project",
        arguments: { projectId: otherProjectId },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).toBe(true);
    expect(payload.result?.content?.[0]?.text).toContain(
      "You do not have access to this project.",
    );
  });

  it("returns an error when get_project is called with a non-existent projectId", async () => {
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "get-project-missing",
      method: "tools/call",
      params: {
        name: "get_project",
        arguments: { projectId: "non-existent-project-id" },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).toBe(true);
  });

  it("returns an error when get_story is called with a non-existent storyId", async () => {
    const projectId = await createProject("Missing Story Project");
    const accessToken = await issueMcpAccessToken();

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "get-missing-story",
      method: "tools/call",
      params: {
        name: "get_story",
        arguments: {
          projectId,
          storyId: "non-existent-id",
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).toBe(true);
    expect(payload.result?.content?.[0]?.text).toContain(
      "Story not found: non-existent-id",
    );
  });

  it("filters stories to the current iteration and applies limit in priority order", async () => {
    const projectId = await createProject("Current Iteration Project");
    const accessToken = await issueMcpAccessToken();
    const firstStoryId = await createStory(projectId, "Current story 1");
    const secondStoryId = await createStory(projectId, "Current story 2");
    const futureStoryId = await createStory(projectId, "Future story");

    const today = new Date().toISOString().slice(0, 10);
    const currentIterationId = await insertIteration(
      projectId,
      addDays(today, -1),
      addDays(today, 7),
    );
    const futureIterationId = await insertIteration(
      projectId,
      addDays(today, 8),
      addDays(today, 15),
    );

    await assignStoryToIteration(projectId, currentIterationId, firstStoryId);
    await assignStoryToIteration(projectId, currentIterationId, secondStoryId);
    await assignStoryToIteration(projectId, futureIterationId, futureStoryId);

    const response = await fetchMcp(accessToken, {
      jsonrpc: "2.0",
      id: "current-iteration-stories",
      method: "tools/call",
      params: {
        name: "list_stories",
        arguments: {
          projectId,
          iterationScope: "current",
          limit: 1,
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = (await parseMcpResult(response)) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };
    expect(payload.result?.isError).not.toBe(true);
    expect(JSON.parse(payload.result?.content?.[0]?.text ?? "")).toEqual({
      stories: [
        expect.objectContaining({
          id: secondStoryId,
          title: "Current story 2",
          iterationId: currentIterationId,
        }),
      ],
    });
  });
});

async function createProject(
  name: string,
  overrides?: Parameters<typeof createAuthHeaders>[0],
) {
  const response = await SELF.fetch("http://localhost/api/projects", {
    method: "POST",
    headers: {
      ...(await createAuthHeaders(overrides)),
      "content-type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  expect(response.status).toBe(201);
  const payload = (await response.json()) as { project: { id: string } };
  return payload.project.id;
}

async function createStory(
  projectId: string,
  title: string,
  options?: {
    authOverrides?: Parameters<typeof createAuthHeaders>[0];
    type?: "feature" | "bug" | "chore" | "release";
    storyPoint?: number | null;
    status?: string;
  },
) {
  const response = await SELF.fetch(
    `http://localhost/api/projects/${projectId}/stories`,
    {
      method: "POST",
      headers: {
        ...(await createAuthHeaders(options?.authOverrides)),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title,
        description: `${title} description`,
        type: options?.type ?? "feature",
        status: options?.status ?? "Unstarted",
        storyPoint: options?.storyPoint ?? null,
        labels: [],
      }),
    },
  );

  expect(response.status).toBe(201);
  const payload = (await response.json()) as { story: { id: string } };
  return payload.story.id;
}

async function insertIteration(
  projectId: string,
  startDate: string,
  endDate: string,
) {
  const db = createDb(env.DB);
  const id = ulid();
  const now = new Date().toISOString();
  const existing = await db
    .select({ iterationNumber: iterationsTable.iterationNumber })
    .from(iterationsTable)
    .where(eq(iterationsTable.projectId, projectId))
    .all();
  const nextIterationNumber =
    existing.reduce((max, row) => Math.max(max, row.iterationNumber), 0) + 1;
  await db.insert(iterationsTable).values({
    id,
    projectId,
    iterationNumber: nextIterationNumber,
    startDate,
    endDate,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function buildCurrentIterationWindow() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 1);
  const end = new Date(today);
  end.setDate(today.getDate() + 14);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

async function assignStoryToIteration(
  projectId: string,
  iterationId: string,
  storyId: string,
) {
  const response = await SELF.fetch(
    `http://localhost/api/projects/${projectId}/iterations/${iterationId}/stories`,
    {
      method: "POST",
      headers: {
        ...(await createAuthHeaders()),
        "content-type": "application/json",
      },
      body: JSON.stringify({ storyId }),
    },
  );

  expect(response.status).toBe(200);
}

async function registerClient() {
  const response = await SELF.fetch("http://localhost/oauth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_name: "Claude Code",
      redirect_uris: ["https://claude.example/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp",
    }),
  });

  expect(response.status).toBe(201);
  const payload = (await response.json()) as ClientRegistrationResponse;
  expect(payload.client_id).toBeTruthy();
  return payload.client_id ?? "";
}

async function issueMcpAccessToken() {
  return issueAccessTokenForResource("http://localhost/programmatic-api/mcp");
}

async function issueAccessTokenForResource(resource: string) {
  const clientId = await registerClient();
  const verifier = "test-verifier-123456789";
  const challenge = await createCodeChallenge(verifier);

  const authorizeUrl = new URL("http://localhost/oauth/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set(
    "redirect_uri",
    "https://claude.example/callback",
  );
  authorizeUrl.searchParams.set("scope", "mcp");
  authorizeUrl.searchParams.set("state", "state-123");
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("resource", resource);

  const authorizeResponse = await SELF.fetch(authorizeUrl, {
    headers: await createAuthHeaders(),
    redirect: "manual",
  });

  expect(authorizeResponse.status).toBe(302);
  const redirectUrl = new URL(authorizeResponse.headers.get("location") ?? "");
  expect(redirectUrl.origin).toBe("https://claude.example");
  expect(redirectUrl.searchParams.get("state")).toBe("state-123");
  const code = redirectUrl.searchParams.get("code");
  expect(code).toBeTruthy();

  const tokenResponse = await SELF.fetch("http://localhost/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code: code ?? "",
      redirect_uri: "https://claude.example/callback",
      code_verifier: verifier,
    }).toString(),
  });

  expect(tokenResponse.status).toBe(200);
  const tokenBody = (await tokenResponse.json()) as TokenResponse;
  expect(tokenBody.access_token).toBeTruthy();
  return tokenBody.access_token ?? "";
}

async function fetchMcp(accessToken: string, body: unknown) {
  return SELF.fetch("http://localhost/programmatic-api/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-03-26",
    },
    body: JSON.stringify(body),
  });
}

async function clearOAuthKv() {
  const oauthKv = env.OAUTH_KV;
  if (!oauthKv) {
    throw new Error("OAUTH_KV is not configured in the test environment");
  }

  let cursor: string | undefined;

  do {
    const page = await oauthKv.list({ cursor });
    await Promise.all(
      page.keys.map((key) => {
        return oauthKv.delete(key.name);
      }),
    );
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

async function createCodeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );

  return toBase64Url(new Uint8Array(digest));
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function parseMcpResult(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  const data = text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => {
      return line.slice("data: ".length);
    })
    .join("\n");

  return JSON.parse(data);
}
