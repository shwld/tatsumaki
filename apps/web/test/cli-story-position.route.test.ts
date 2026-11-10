import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { issueAccessToken } from "./helpers/cli-auth";
import { resetDatabase } from "./helpers/db";

type Story = {
  id: string;
  storyNumber: number;
  title: string;
  isIcebox: boolean;
  storyPoint: number | null;
  section?: string;
};

async function createProject(name: string) {
  const response = await SELF.fetch("https://localhost/api/projects", {
    method: "POST",
    headers: {
      ...(await createAuthHeaders()),
      "content-type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { project: { id: string } }).project.id;
}

describe("cli story positioning", () => {
  let headers: Record<string, string>;
  let storiesUrl: string;
  let projectId: string;

  const call = async (path: string, method: string, body?: unknown) =>
    SELF.fetch(`${storiesUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const createStory = async (title: string, extra: object = {}) => {
    const response = await call("", "POST", { title, type: "chore", ...extra });
    expect(response.status).toBe(201);
    return ((await response.json()) as { story: Story }).story;
  };

  const backlogTitles = async () => {
    const response = await call("?status=Unstarted", "GET");
    const { stories } = (await response.json()) as { stories: Story[] };
    return stories.filter((s) => !s.isIcebox).map((s) => s.title);
  };

  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
    const accessToken = await issueAccessToken();
    headers = {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    };
    projectId = await createProject("Position project");
    storiesUrl = `https://localhost/programmatic-api/v1/projects/${projectId}/stories`;
  });

  const seedBacklog = async () => {
    // New stories land on top, so create in reverse to get A, B, C, D.
    const stories: Story[] = [];
    for (const title of ["D", "C", "B", "A"]) {
      stories.unshift(await createStory(title));
    }
    expect(await backlogTitles()).toEqual(["A", "B", "C", "D"]);
    return stories;
  };

  it("moves a story to the end by number and keeps the others in order", async () => {
    const [a] = await seedBacklog();
    const response = await call("/reorder", "POST", {
      storyNumber: a.storyNumber,
      placement: { position: "end" },
    });
    expect(response.status).toBe(200);
    expect(await backlogTitles()).toEqual(["B", "C", "D", "A"]);
  });

  it("returns the same story set whether or not the order changed", async () => {
    const [a, b] = await seedBacklog();
    await createStory("Iced", { isIcebox: true });
    const ids = async (storyNumber: number, position: string) => {
      const response = await call("/reorder", "POST", {
        storyNumber,
        placement:
          position === "end"
            ? { position }
            : { position, relativeToStoryNumber: a.storyNumber },
      });
      const { stories } = (await response.json()) as { stories: Story[] };
      return stories.map((s) => s.title).sort();
    };
    const noOp = await ids(b.storyNumber, "after");
    const changed = await ids(b.storyNumber, "end");
    expect(noOp).toEqual(changed);
  });

  it("moves a story to the top, and before/after another story", async () => {
    const [a, b, c, d] = await seedBacklog();
    await call("/reorder", "POST", {
      storyNumber: d.storyNumber,
      placement: { position: "top" },
    });
    expect(await backlogTitles()).toEqual(["D", "A", "B", "C"]);

    await call("/reorder", "POST", {
      storyNumber: d.storyNumber,
      placement: { position: "after", relativeToStoryNumber: b.storyNumber },
    });
    expect(await backlogTitles()).toEqual(["A", "B", "D", "C"]);

    await call("/reorder", "POST", {
      storyNumber: c.storyNumber,
      placement: { position: "before", relativeToStoryNumber: a.storyNumber },
    });
    expect(await backlogTitles()).toEqual(["C", "A", "B", "D"]);
  });

  it("leaves the order untouched when the story is already in place", async () => {
    const [a, b] = await seedBacklog();
    const response = await call("/reorder", "POST", {
      storyNumber: b.storyNumber,
      placement: { position: "after", relativeToStoryNumber: a.storyNumber },
    });
    expect(response.status).toBe(200);
    expect(await backlogTitles()).toEqual(["A", "B", "C", "D"]);
  });

  it("rejects Icebox targets, Icebox anchors, self anchors and unknown stories", async () => {
    const [a] = await seedBacklog();
    const iceboxed = await createStory("Iced", { isIcebox: true });
    const move = (storyNumber: number, placement: object) =>
      call("/reorder", "POST", { storyNumber, placement });

    expect((await move(iceboxed.storyNumber, { position: "top" })).status).toBe(
      409,
    );
    expect(
      (
        await move(a.storyNumber, {
          position: "after",
          relativeToStoryNumber: iceboxed.storyNumber,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await move(a.storyNumber, {
          position: "after",
          relativeToStoryNumber: a.storyNumber,
        })
      ).status,
    ).toBe(400);
    expect((await move(9999, { position: "top" })).status).toBe(404);
    expect(
      (
        await move(a.storyNumber, {
          position: "before",
          relativeToStoryNumber: 9999,
        })
      ).status,
    ).toBe(404);
    expect((await move(a.storyNumber, { position: "middle" })).status).toBe(
      400,
    );
    expect(await backlogTitles()).toEqual(["A", "B", "C", "D"]);
  });

  it("rejects stories and anchors from another project", async () => {
    const [a] = await seedBacklog();
    const otherProjectId = await createProject("Other project");
    const otherUrl = `https://localhost/programmatic-api/v1/projects/${otherProjectId}/stories`;
    let foreignNumber = 0;
    for (let i = 0; i < 10; i += 1) {
      const created = (await (
        await SELF.fetch(otherUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ title: `F${i}`, type: "chore" }),
        })
      ).json()) as { story: Story };
      foreignNumber = created.story.storyNumber;
    }
    // Story numbers are per project; this one exists only in the other project.
    const asTarget = await call("/reorder", "POST", {
      storyNumber: foreignNumber,
      placement: { position: "top" },
    });
    expect(asTarget.status).toBe(404);
    const asAnchor = await call("/reorder", "POST", {
      storyNumber: a.storyNumber,
      placement: { position: "after", relativeToStoryNumber: foreignNumber },
    });
    expect(asAnchor.status).toBe(404);
    expect(await backlogTitles()).toEqual(["A", "B", "C", "D"]);
  });

  it("places a story leaving the Icebox at the requested position", async () => {
    const [a, b] = await seedBacklog();
    const iceboxed = await createStory("Iced", { isIcebox: true });
    const response = await call(`/${iceboxed.storyNumber}`, "PATCH", {
      isIcebox: false,
      placement: { position: "after", relativeToStoryNumber: b.storyNumber },
    });
    expect(response.status).toBe(200);
    expect(await backlogTitles()).toEqual(["A", "B", "Iced", "C", "D"]);
    expect(a.title).toBe("A");

    const toEnd = await createStory("Iced2", { isIcebox: true });
    await call(`/${toEnd.storyNumber}`, "PATCH", {
      isIcebox: false,
      placement: { position: "end" },
    });
    expect(await backlogTitles()).toEqual([
      "A",
      "B",
      "Iced",
      "C",
      "D",
      "Iced2",
    ]);
  });

  it("repositions a Backlog story with a placement-only update", async () => {
    const [a] = await seedBacklog();
    const response = await call(`/${a.storyNumber}`, "PATCH", {
      placement: { position: "end" },
    });
    expect(response.status).toBe(200);
    expect(await backlogTitles()).toEqual(["B", "C", "D", "A"]);
  });

  it("does not change the story when its placement anchor is invalid", async () => {
    await seedBacklog();
    const iceboxed = await createStory("Iced", { isIcebox: true });
    const response = await call(`/${iceboxed.storyNumber}`, "PATCH", {
      isIcebox: false,
      title: "Renamed",
      placement: { position: "after", relativeToStoryNumber: 9999 },
    });
    expect(response.status).toBe(404);
    const list = (await (await call("?icebox=true", "GET")).json()) as {
      stories: Story[];
    };
    expect(list.stories.map((s) => s.title)).toEqual(["Iced"]);
  });

  it("refuses to position a story that stays in the Icebox", async () => {
    await seedBacklog();
    const iceboxed = await createStory("Iced", { isIcebox: true });
    const response = await call(`/${iceboxed.storyNumber}`, "PATCH", {
      placement: { position: "top" },
    });
    expect(response.status).toBe(409);
  });

  it("creates a story with an estimate at a position", async () => {
    const [a, b] = await seedBacklog();
    const created = await createStory("New", {
      storyPoint: 3,
      placement: { position: "after", relativeToStoryNumber: a.storyNumber },
    });
    expect(created.storyPoint).toBe(3);
    expect(await backlogTitles()).toEqual(["A", "New", "B", "C", "D"]);
    expect(b.title).toBe("B");

    const iceboxPlacement = await call("", "POST", {
      title: "Bad",
      type: "chore",
      isIcebox: true,
      placement: { position: "top" },
    });
    expect(iceboxPlacement.status).toBe(400);
  });

  it("reports the UI section for every story", async () => {
    await seedBacklog();
    await createStory("Iced", { isIcebox: true });
    const { stories } = (await (await call("", "GET")).json()) as {
      stories: Story[];
    };
    const sections = Object.fromEntries(
      stories.map((s) => [s.title, s.section]),
    );
    expect(sections).toEqual({
      A: "Backlog",
      B: "Backlog",
      C: "Backlog",
      D: "Backlog",
      Iced: "Icebox",
    });
  });

  it("creates labels through the CLI API", async () => {
    const labelsUrl = `https://localhost/programmatic-api/v1/projects/${projectId}/labels`;
    const created = await SELF.fetch(labelsUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "epic-a", color: "#ff0000" }),
    });
    expect(created.status).toBe(201);
    const duplicate = await SELF.fetch(labelsUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "epic-a", color: "#ff0000" }),
    });
    expect(duplicate.status).toBe(409);
    const invalid = await SELF.fetch(labelsUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "x", color: "red" }),
    });
    expect(invalid.status).toBe(400);
  });
});
