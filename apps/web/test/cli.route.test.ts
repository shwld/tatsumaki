import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";

describe("cli route", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
  });

  it("returns version compatibility payload", async () => {
    const accessToken = await issueAccessTokenForCliV1();
    const response = await SELF.fetch(
      "http://localhost/programmatic-api/v1/version",
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      apiVersion: "0.0.7",
      minClientVersion: "0.0.7",
    });
  });

  it("returns current user on whoami endpoint", async () => {
    const accessToken = await issueAccessTokenForCliV1();
    const response = await SELF.fetch(
      "http://localhost/programmatic-api/v1/whoami",
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        email: expect.any(String),
      }),
    );
  });

  it("supports CLI story write/read flow", async () => {
    const accessToken = await issueAccessTokenForCliV1();
    const projectId = await createProject();

    const createResponse = await SELF.fetch(
      `http://localhost/programmatic-api/v1/projects/${projectId}/stories`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "CLI story",
          type: "feature",
          description: "created from cli route test",
        }),
      },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      story: { id: string; storyNumber: number };
    };

    const updateResponse = await SELF.fetch(
      `http://localhost/programmatic-api/v1/projects/${projectId}/stories/${created.story.storyNumber}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "CLI story updated",
          storyPoint: 1,
          status: "Started",
        }),
      },
    );
    expect(updateResponse.status).toBe(200);

    const clearStoryPointResponse = await SELF.fetch(
      `http://localhost/programmatic-api/v1/projects/${projectId}/stories/${created.story.storyNumber}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          storyPoint: null,
        }),
      },
    );
    expect(clearStoryPointResponse.status).toBe(200);
    expect(await clearStoryPointResponse.json()).toEqual(
      expect.objectContaining({
        story: expect.objectContaining({
          storyPoint: null,
        }),
      }),
    );

    const commentResponse = await SELF.fetch(
      `http://localhost/programmatic-api/v1/projects/${projectId}/stories/${created.story.storyNumber}/comments`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ body: "cli comment" }),
      },
    );
    expect(commentResponse.status).toBe(201);

    const listResponse = await SELF.fetch(
      `http://localhost/programmatic-api/v1/projects/${projectId}/stories`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      stories: Array<{ id: string; title: string; status: string }>;
    };
    expect(listed.stories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.story.id,
          title: "CLI story updated",
        }),
      ]),
    );

    const getResponse = await SELF.fetch(
      `http://localhost/programmatic-api/v1/projects/${projectId}/stories/${created.story.storyNumber}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );
    expect(getResponse.status).toBe(200);
  });

  it("rejects invalid CLI story update fields without server error", async () => {
    const accessToken = await issueAccessTokenForCliV1();
    const projectId = await createProject();

    const createResponse = await SELF.fetch(
      `http://localhost/programmatic-api/v1/projects/${projectId}/stories`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "CLI invalid update story",
          type: "chore",
          description: "",
        }),
      },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      story: { storyNumber: number };
    };

    const invalidResponse = await SELF.fetch(
      `http://localhost/programmatic-api/v1/projects/${projectId}/stories/${created.story.storyNumber}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          description: null,
          status: "Finished",
        }),
      },
    );

    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toEqual({
      error: "Story description must be a string",
    });
  });

  it("supports CLI reorder and rejects empty orderedIds", async () => {
    const accessToken = await issueAccessTokenForCliV1();
    const projectId = await createProject();
    const storyIds: string[] = [];
    for (const title of ["A", "B"]) {
      const response = await SELF.fetch(
        `http://localhost/programmatic-api/v1/projects/${projectId}/stories`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ title, type: "feature", description: title }),
        },
      );
      const payload = (await response.json()) as { story: { id: string } };
      storyIds.push(payload.story.id);
    }

    const reorderResponse = await SELF.fetch(
      `http://localhost/programmatic-api/v1/projects/${projectId}/stories/reorder`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ orderedIds: [storyIds[1], storyIds[0]] }),
      },
    );
    expect(reorderResponse.status).toBe(200);

    const invalidResponse = await SELF.fetch(
      `http://localhost/programmatic-api/v1/projects/${projectId}/stories/reorder`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ orderedIds: [] }),
      },
    );
    expect(invalidResponse.status).toBe(400);
  });
});

async function createProject() {
  const response = await SELF.fetch("http://localhost/api/projects", {
    method: "POST",
    headers: {
      ...(await createAuthHeaders()),
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "CLI test project" }),
  });
  expect(response.status).toBe(201);
  const payload = (await response.json()) as { project: { id: string } };
  return payload.project.id;
}

async function issueAccessTokenForCliV1() {
  const response = await SELF.fetch("http://localhost/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "tm",
      redirect_uris: ["https://tm.example/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp",
    }),
  });
  expect(response.status).toBe(201);
  const { client_id } = (await response.json()) as { client_id?: string };
  expect(client_id).toBeTruthy();

  const verifier = "test-verifier-cli-v1";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  const authorizeUrl = new URL("http://localhost/oauth/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", client_id ?? "");
  authorizeUrl.searchParams.set("redirect_uri", "https://tm.example/callback");
  authorizeUrl.searchParams.set("scope", "mcp");
  authorizeUrl.searchParams.set("state", "state-cli-v1");
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set(
    "resource",
    "http://localhost/programmatic-api/v1",
  );

  const authorizeResponse = await SELF.fetch(authorizeUrl, {
    headers: await createAuthHeaders(),
    redirect: "manual",
  });
  expect(authorizeResponse.status).toBe(302);
  const redirectUrl = new URL(authorizeResponse.headers.get("location") ?? "");
  const code = redirectUrl.searchParams.get("code");
  expect(code).toBeTruthy();

  const tokenResponse = await SELF.fetch("http://localhost/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client_id ?? "",
      code: code ?? "",
      redirect_uri: "https://tm.example/callback",
      code_verifier: verifier,
    }).toString(),
  });
  expect(tokenResponse.status).toBe(200);
  const { access_token } = (await tokenResponse.json()) as {
    access_token?: string;
  };
  expect(access_token).toBeTruthy();
  return access_token ?? "";
}
