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
      apiVersion: "0.0.12",
      minClientVersion: "0.0.12",
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

  it("moves a CLI story between Icebox and Backlog and rejects it once started", async () => {
    const accessToken = await issueAccessTokenForCliV1();
    const projectId = await createProject();
    const headers = {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    };

    const createResponse = await SELF.fetch(
      `https://localhost/programmatic-api/v1/projects/${projectId}/stories`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "CLI icebox story",
          type: "chore",
          isIcebox: true,
        }),
      },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      story: { storyNumber: number; isIcebox: boolean };
    };
    expect(created.story.isIcebox).toBe(true);
    const storyUrl = `https://localhost/programmatic-api/v1/projects/${projectId}/stories/${created.story.storyNumber}`;

    const toBacklog = await SELF.fetch(storyUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ isIcebox: false }),
    });
    expect(toBacklog.status).toBe(200);
    expect(await toBacklog.json()).toEqual(
      expect.objectContaining({
        story: expect.objectContaining({ isIcebox: false }),
      }),
    );

    const backToIcebox = await SELF.fetch(storyUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ isIcebox: true }),
    });
    expect(backToIcebox.status).toBe(200);
    expect(await backToIcebox.json()).toEqual(
      expect.objectContaining({
        story: expect.objectContaining({ isIcebox: true }),
      }),
    );

    const started = await SELF.fetch(storyUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "Started" }),
    });
    expect(started.status).toBe(200);

    const iceboxStarted = await SELF.fetch(storyUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ isIcebox: true }),
    });
    expect(iceboxStarted.status).toBe(400);
    expect(await iceboxStarted.json()).toEqual({
      error:
        "Only an Unstarted story without an iteration can be in the Icebox",
    });

    const invalidType = await SELF.fetch(storyUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ isIcebox: "no" }),
    });
    expect(invalidType.status).toBe(400);
    expect(await invalidType.json()).toEqual({
      error: "isIcebox must be a boolean",
    });
  });

  it("puts a story leaving the Icebox at the top of the Backlog", async () => {
    const accessToken = await issueAccessTokenForCliV1();
    const projectId = await createProject();
    const headers = {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    };
    const storiesUrl = `https://localhost/programmatic-api/v1/projects/${projectId}/stories`;
    const createStory = async (title: string, isIcebox: boolean) => {
      const response = await SELF.fetch(storiesUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ title, type: "chore", isIcebox }),
      });
      return (
        (await response.json()) as {
          story: { id: string; storyNumber: number };
        }
      ).story;
    };
    await createStory("First", false);
    await createStory("Second", false);
    const iceboxed = await createStory("From icebox", true);

    const rejected = await SELF.fetch(`${storiesUrl}/${iceboxed.storyNumber}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ isIcebox: false, title: "" }),
    });
    expect(rejected.status).toBe(400);
    const titlesAfterRejection = (
      (await (
        await SELF.fetch(`${storiesUrl}?status=Unstarted`, { headers })
      ).json()) as { stories: { title: string; isIcebox: boolean }[] }
    ).stories
      .filter((story) => !story.isIcebox)
      .map((story) => story.title);
    expect(titlesAfterRejection).toEqual(["Second", "First"]);

    const moved = await SELF.fetch(`${storiesUrl}/${iceboxed.storyNumber}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ isIcebox: false }),
    });
    expect(moved.status).toBe(200);

    const listResponse = await SELF.fetch(`${storiesUrl}?status=Unstarted`, {
      headers,
    });
    const listed = (await listResponse.json()) as {
      stories: { title: string; isIcebox: boolean }[];
    };
    const backlogTitles = listed.stories
      .filter((story) => !story.isIcebox)
      .map((story) => story.title);
    expect(backlogTitles).toEqual(["From icebox", "Second", "First"]);
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

  describe("story blockers", () => {
    const blockersUrl = (projectId: string, storyNumber: number) =>
      `https://localhost/programmatic-api/v1/projects/${projectId}/stories/${storyNumber}/blockers`;

    const createStories = async (projectId: string, count: number) => {
      const accessToken = await issueAccessTokenForCliV1();
      const stories: Array<{ id: string; storyNumber: number }> = [];
      for (let index = 0; index < count; index += 1) {
        const response = await SELF.fetch(
          `https://localhost/programmatic-api/v1/projects/${projectId}/stories`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              title: `Story ${index + 1}`,
              type: "feature",
              description: "d",
            }),
          },
        );
        expect(response.status).toBe(201);
        stories.push(
          ((await response.json()) as { story: (typeof stories)[number] })
            .story,
        );
      }
      return stories;
    };

    const changeBlocker = async (
      method: "POST" | "DELETE",
      projectId: string,
      storyNumber: number,
      body: unknown,
    ) => {
      const accessToken = await issueAccessTokenForCliV1();
      return SELF.fetch(blockersUrl(projectId, storyNumber), {
        method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    };

    it("adds and removes a blocker by story number and reports whether it changed", async () => {
      const projectId = await createProject();
      const [blocking, blocked] = await createStories(projectId, 2);

      const add = await changeBlocker("POST", projectId, blocked.storyNumber, {
        relation: "blockedBy",
        targetStoryId: String(blocking.storyNumber),
      });
      expect(add.status).toBe(200);
      expect(await add.json()).toEqual({
        story: expect.objectContaining({
          storyNumber: blocked.storyNumber,
          isBlocked: true,
          blockingStories: [
            {
              id: blocking.id,
              storyNumber: blocking.storyNumber,
              title: "Story 1",
              status: "Unstarted",
            },
          ],
        }),
        relatedStory: expect.objectContaining({
          storyNumber: blocking.storyNumber,
          isBlocking: true,
        }),
        changed: true,
      });

      const addAgain = await changeBlocker(
        "POST",
        projectId,
        blocked.storyNumber,
        { relation: "blockedBy", targetStoryId: String(blocking.storyNumber) },
      );
      expect(addAgain.status).toBe(200);
      expect(await addAgain.json()).toEqual(
        expect.objectContaining({ changed: false }),
      );

      const accessToken = await issueAccessTokenForCliV1();
      const getResponse = await SELF.fetch(
        `https://localhost/programmatic-api/v1/projects/${projectId}/stories/${blocked.storyNumber}`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      );
      const fetched = (await getResponse.json()) as {
        story: { blockingStories: Array<{ storyNumber: number }> };
      };
      expect(fetched.story.blockingStories).toEqual([
        expect.objectContaining({ storyNumber: blocking.storyNumber }),
      ]);

      const remove = await changeBlocker(
        "DELETE",
        projectId,
        blocking.storyNumber,
        { relation: "blocks", targetStoryId: String(blocked.storyNumber) },
      );
      expect(remove.status).toBe(200);
      expect(await remove.json()).toEqual(
        expect.objectContaining({
          changed: true,
          story: expect.objectContaining({ isBlocking: false }),
        }),
      );

      const removeAgain = await changeBlocker(
        "DELETE",
        projectId,
        blocking.storyNumber,
        { relation: "blocks", targetStoryId: String(blocked.storyNumber) },
      );
      expect(await removeAgain.json()).toEqual(
        expect.objectContaining({ changed: false }),
      );
    });

    it("rejects a story blocking itself", async () => {
      const projectId = await createProject();
      const [story] = await createStories(projectId, 1);

      const response = await changeBlocker(
        "POST",
        projectId,
        story.storyNumber,
        { relation: "blockedBy", targetStoryId: String(story.storyNumber) },
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "A story cannot block itself",
      });
    });

    it("rejects a missing story", async () => {
      const projectId = await createProject();
      const [story] = await createStories(projectId, 1);

      const response = await changeBlocker(
        "POST",
        projectId,
        story.storyNumber,
        { relation: "blockedBy", targetStoryId: "999" },
      );
      expect(response.status).toBe(404);
    });

    it("rejects a story from another project", async () => {
      const projectId = await createProject();
      const otherProjectId = await createProject();
      const [story] = await createStories(projectId, 1);
      const [other] = await createStories(otherProjectId, 1);

      const byId = await changeBlocker("POST", projectId, story.storyNumber, {
        relation: "blockedBy",
        targetStoryId: other.id,
      });
      expect(byId.status).toBe(404);
    });

    it("rejects direct and transitive cycles", async () => {
      const projectId = await createProject();
      const [a, b, c] = await createStories(projectId, 3);
      const blockedBy = (story: typeof a, by: typeof a) =>
        changeBlocker("POST", projectId, story.storyNumber, {
          relation: "blockedBy",
          targetStoryId: String(by.storyNumber),
        });

      expect((await blockedBy(a, b)).status).toBe(200);
      expect((await blockedBy(b, c)).status).toBe(200);

      const direct = await blockedBy(b, a);
      expect(direct.status).toBe(409);
      expect(await direct.json()).toEqual({
        error: `Cannot make #${a.storyNumber} block #${b.storyNumber}: #${b.storyNumber} already blocks #${a.storyNumber} (directly or through other stories)`,
      });

      const transitive = await blockedBy(c, a);
      expect(transitive.status).toBe(409);
    });

    it("rejects an invalid body", async () => {
      const projectId = await createProject();
      const [story] = await createStories(projectId, 1);

      const response = await changeBlocker(
        "POST",
        projectId,
        story.storyNumber,
        { relation: "nope", targetStoryId: "1" },
      );
      expect(response.status).toBe(400);
    });
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
