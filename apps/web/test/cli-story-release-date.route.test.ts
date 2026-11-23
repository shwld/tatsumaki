import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { issueAccessToken } from "./helpers/cli-auth";
import { resetDatabase } from "./helpers/db";

type Story = {
  storyNumber: number;
  title: string;
  type: string;
  releaseDate: string | null;
};

describe("release date on the programmatic API", () => {
  let headers: Record<string, string>;
  let storiesUrl: string;
  let webStoriesUrl: string;
  let webHeaders: Record<string, string>;

  const call = (path: string, method: string, body?: unknown) =>
    SELF.fetch(`${storiesUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const getStory = async (storyNumber: number) => {
    const response = await call(`/${storyNumber}`, "GET");
    expect(response.status).toBe(200);
    return ((await response.json()) as { story: Story }).story;
  };

  const createRelease = async (extra: object = {}) => {
    const response = await call("", "POST", {
      title: "v1",
      type: "release",
      description: "",
      ...extra,
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as { story: Story }).story;
  };

  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
    webHeaders = {
      ...(await createAuthHeaders()),
      "content-type": "application/json",
    };
    const created = await SELF.fetch("https://localhost/api/projects", {
      method: "POST",
      headers: webHeaders,
      body: JSON.stringify({ name: "Release date project" }),
    });
    const projectId = ((await created.json()) as { project: { id: string } })
      .project.id;
    headers = {
      authorization: `Bearer ${await issueAccessToken()}`,
      "content-type": "application/json",
    };
    storiesUrl = `https://localhost/programmatic-api/v1/projects/${projectId}/stories`;
    webStoriesUrl = `https://localhost/api/projects/${projectId}/stories`;
  });

  it("creates a release marker with a planned date and without one", async () => {
    const dated = await createRelease({ releaseDate: "2026-12-01" });
    expect(dated.releaseDate).toBe("2026-12-01");
    expect((await getStory(dated.storyNumber)).releaseDate).toBe("2026-12-01");

    const undated = await createRelease({ title: "v2" });
    expect(undated.releaseDate).toBeNull();
  });

  it("sets, changes, keeps and clears the date with a date-only update", async () => {
    const { storyNumber } = await createRelease();

    const set = await call(`/${storyNumber}`, "PATCH", {
      releaseDate: "2026-12-01",
    });
    expect(set.status).toBe(200);
    expect((await getStory(storyNumber)).releaseDate).toBe("2026-12-01");

    const retitled = await call(`/${storyNumber}`, "PATCH", { title: "v1.1" });
    expect(retitled.status).toBe(200);
    const kept = await getStory(storyNumber);
    expect(kept.title).toBe("v1.1");
    expect(kept.releaseDate).toBe("2026-12-01");

    const both = await call(`/${storyNumber}`, "PATCH", {
      title: "v1.2",
      releaseDate: "2027-01-15",
    });
    expect(both.status).toBe(200);
    const changed = await getStory(storyNumber);
    expect(changed).toMatchObject({ title: "v1.2", releaseDate: "2027-01-15" });

    const cleared = await call(`/${storyNumber}`, "PATCH", {
      releaseDate: null,
    });
    expect(cleared.status).toBe(200);
    expect((await getStory(storyNumber)).releaseDate).toBeNull();
  });

  it("rejects dates that do not exist or are not YYYY-MM-DD", async () => {
    const { storyNumber } = await createRelease({ releaseDate: "2026-12-01" });
    for (const releaseDate of [
      "2026-02-30",
      "2026-13-01",
      "2026/12/01",
      20261201,
    ]) {
      const created = await call("", "POST", {
        title: "bad",
        type: "release",
        description: "",
        releaseDate,
      });
      expect(created.status).toBe(400);
      const updated = await call(`/${storyNumber}`, "PATCH", { releaseDate });
      expect(updated.status).toBe(400);
    }
    expect((await getStory(storyNumber)).releaseDate).toBe("2026-12-01");
  });

  it("rejects a planned date on stories that are not releases", async () => {
    const created = await call("", "POST", {
      title: "feature",
      type: "feature",
      description: "",
    });
    const feature = ((await created.json()) as { story: Story }).story;

    const onCreate = await call("", "POST", {
      title: "dated feature",
      type: "feature",
      description: "",
      releaseDate: "2026-12-01",
    });
    expect(onCreate.status).toBe(400);

    const onUpdate = await call(`/${feature.storyNumber}`, "PATCH", {
      releaseDate: "2026-12-01",
    });
    expect(onUpdate.status).toBe(400);

    const clear = await call(`/${feature.storyNumber}`, "PATCH", {
      releaseDate: null,
    });
    expect(clear.status).toBe(200);
  });

  it("applies the same rules on the web API", async () => {
    const created = await SELF.fetch(webStoriesUrl, {
      method: "POST",
      headers: webHeaders,
      body: JSON.stringify({
        title: "web",
        type: "release",
        releaseDate: "2026-02-30",
      }),
    });
    expect(created.status).toBe(400);

    const ok = await SELF.fetch(webStoriesUrl, {
      method: "POST",
      headers: webHeaders,
      body: JSON.stringify({ title: "web", type: "release" }),
    });
    expect(ok.status).toBe(201);
    const { storyNumber } = ((await ok.json()) as { story: Story }).story;

    const patched = await SELF.fetch(`${webStoriesUrl}/${storyNumber}`, {
      method: "PATCH",
      headers: webHeaders,
      body: JSON.stringify({ releaseDate: "2026-12-24" }),
    });
    expect(patched.status).toBe(200);
    expect((await getStory(storyNumber)).releaseDate).toBe("2026-12-24");
  });
});
