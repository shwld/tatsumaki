import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";

describe("api-key story route", () => {
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
      body: JSON.stringify({ name: "API Key Story Test" }),
    });
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { project: { id: string } };
    return payload.project.id;
  };

  const createStory = async (projectId: string) => {
    const response = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/stories`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "API key test story",
          type: "feature",
          description: "test",
        }),
      },
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      story: { id: string; storyNumber: number };
    };
    return payload.story;
  };

  const issueApiKey = async (
    projectId: string,
    scopes: string[] = ["story:write"],
  ) => {
    const response = await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/api-keys`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Test Key", scopes }),
      },
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      apiKey: { id: string };
      rawKey: string;
    };
    return payload;
  };

  it("valid story:write key can PATCH a story", async () => {
    const projectId = await createProject();
    const story = await createStory(projectId);
    const { rawKey } = await issueApiKey(projectId, ["story:write"]);

    const response = await SELF.fetch(
      `http://localhost/api-key/v1/projects/${projectId}/stories/${story.storyNumber}`,
      {
        method: "PATCH",
        headers: {
          "X-Api-Key": rawKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Updated via API key" }),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { story: { title: string } };
    expect(body.story.title).toBe("Updated via API key");
  });

  it("unknown key returns 401", async () => {
    const projectId = await createProject();
    const story = await createStory(projectId);

    const response = await SELF.fetch(
      `http://localhost/api-key/v1/projects/${projectId}/stories/${story.storyNumber}`,
      {
        method: "PATCH",
        headers: {
          "X-Api-Key": "sk_fakefakefakefake",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Should fail" }),
      },
    );

    expect(response.status).toBe(401);
  });

  it("revoked key returns 401", async () => {
    const projectId = await createProject();
    const story = await createStory(projectId);
    const { apiKey, rawKey } = await issueApiKey(projectId, ["story:write"]);

    // Revoke the key
    await fetchWithAuth(
      `http://localhost/api/projects/${projectId}/api-keys/${apiKey.id}`,
      { method: "DELETE" },
    );

    const response = await SELF.fetch(
      `http://localhost/api-key/v1/projects/${projectId}/stories/${story.storyNumber}`,
      {
        method: "PATCH",
        headers: {
          "X-Api-Key": rawKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Should fail after revoke" }),
      },
    );

    expect(response.status).toBe(401);
  });

  it("story:read key cannot PATCH (403 - scope mismatch)", async () => {
    const projectId = await createProject();
    const story = await createStory(projectId);
    const { rawKey } = await issueApiKey(projectId, ["story:read"]);

    const response = await SELF.fetch(
      `http://localhost/api-key/v1/projects/${projectId}/stories/${story.storyNumber}`,
      {
        method: "PATCH",
        headers: {
          "X-Api-Key": rawKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Should fail" }),
      },
    );

    expect(response.status).toBe(403);
  });

  it("key issued for project A cannot edit stories in project B (403)", async () => {
    const projectAId = await createProject();
    const projectBId = await createProject();
    const storyB = await createStory(projectBId);
    const { rawKey } = await issueApiKey(projectAId, ["story:write"]);

    const response = await SELF.fetch(
      `http://localhost/api-key/v1/projects/${projectBId}/stories/${storyB.storyNumber}`,
      {
        method: "PATCH",
        headers: {
          "X-Api-Key": rawKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Should fail - wrong project" }),
      },
    );

    expect(response.status).toBe(403);
  });

  it("missing X-Api-Key returns 401", async () => {
    const projectId = await createProject();
    const story = await createStory(projectId);

    const response = await SELF.fetch(
      `http://localhost/api-key/v1/projects/${projectId}/stories/${story.storyNumber}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Should fail" }),
      },
    );

    expect(response.status).toBe(401);
  });
});
