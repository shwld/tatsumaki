import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { StoryDetailSchema } from "../src/presentation/openapi/cli-openapi";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";
import { issueAccessToken } from "./helpers/cli-auth";

describe("cli route", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
  });

  it("returns version compatibility payload", async () => {
    const accessToken = await issueAccessTokenForCliV1();
    const response = await SELF.fetch(
      "https://localhost/programmatic-api/v1/version",
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      apiVersion: "0.0.10",
      minClientVersion: "0.0.10",
    });
  });

  it("returns current user on whoami endpoint", async () => {
    const accessToken = await issueAccessTokenForCliV1();
    const response = await SELF.fetch(
      "https://localhost/programmatic-api/v1/whoami",
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
      `https://localhost/programmatic-api/v1/projects/${projectId}/stories`,
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

    const detailResponse = await SELF.fetch(
      `https://localhost/programmatic-api/v1/projects/${projectId}/stories/${created.story.storyNumber}`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    expect(detailResponse.status).toBe(200);
    const fetched = (await detailResponse.json()) as { story: unknown };
    expect(StoryDetailSchema.safeParse(fetched.story).success).toBe(true);
    expect(fetched.story).toEqual(
      expect.objectContaining({ description: "created from cli route test" }),
    );

    const updateResponse = await SELF.fetch(
      `https://localhost/programmatic-api/v1/projects/${projectId}/stories/${created.story.storyNumber}`,
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
      `https://localhost/programmatic-api/v1/projects/${projectId}/stories/${created.story.storyNumber}`,
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
      `https://localhost/programmatic-api/v1/projects/${projectId}/stories/${created.story.storyNumber}/comments`,
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
      `https://localhost/programmatic-api/v1/projects/${projectId}/stories`,
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
      `https://localhost/programmatic-api/v1/projects/${projectId}/stories/${created.story.storyNumber}`,
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
      `https://localhost/programmatic-api/v1/projects/${projectId}/stories`,
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
      `https://localhost/programmatic-api/v1/projects/${projectId}/stories/${created.story.storyNumber}`,
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
        `https://localhost/programmatic-api/v1/projects/${projectId}/stories`,
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
      `https://localhost/programmatic-api/v1/projects/${projectId}/stories/reorder`,
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
      `https://localhost/programmatic-api/v1/projects/${projectId}/stories/reorder`,
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
  const response = await SELF.fetch("https://localhost/api/projects", {
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

const issueAccessTokenForCliV1 = () => issueAccessToken();
