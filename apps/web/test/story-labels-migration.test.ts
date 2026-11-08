import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/infrastructure/db/client";
import { projectLabelsTable } from "../src/infrastructure/db/schema/project-labels";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import { storiesTable } from "../src/infrastructure/db/schema/stories";
import { storyLabelsTable } from "../src/infrastructure/db/schema/story-labels";
import { resetDatabase } from "./helpers/db";

const P1 = "01JNMVQ8Q9Y6P5KH1XZ4V7C2T1";
const P2 = "01JNMVQ8Q9Y6P5KH1XZ4V7C2T2";

async function rerunBackfill() {
  const migration = env.TEST_MIGRATIONS.find(
    (item) => item.name === "0059_create_story_labels.sql",
  );
  if (!migration) throw new Error("migration 0059 not found");
  for (const query of migration.queries) {
    if (query.trim().toUpperCase().startsWith("INSERT")) {
      await env.DB.prepare(query).run();
    }
  }
}

describe("0059_create_story_labels backfill", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    const db = createDb(env.DB);
    await db.insert(projectsTable).values([
      { id: P1, name: "One" },
      { id: P2, name: "Two" },
    ]);
  });

  async function insertStory(id: string, projectId: string, labels: string[]) {
    await createDb(env.DB)
      .insert(storiesTable)
      .values({
        id,
        storyNumber: Number.parseInt(id.slice(-2), 10),
        projectId,
        title: id,
        description: "-",
        position: 1,
        labels: JSON.stringify(labels),
      });
  }

  it("maps names to same-project label IDs, creates missing labels and keeps projects apart", async () => {
    const db = createDb(env.DB);
    await db
      .insert(projectLabelsTable)
      .values({ id: "label-existing", projectId: P1, name: "backend" });
    await db
      .insert(projectLabelsTable)
      .values({ id: "label-other-project", projectId: P2, name: "backend" });
    await insertStory("story-with-labels-01", P1, [
      "backend",
      " new ",
      "backend",
    ]);
    await insertStory("story-other-project-02", P2, ["backend"]);
    await insertStory("story-no-labels-03", P1, []);

    await rerunBackfill();
    await rerunBackfill();

    const links = await db.select().from(storyLabelsTable).all();
    const labels = await db.select().from(projectLabelsTable).all();
    const nameOf = (id: string) => labels.find((l) => l.id === id)?.name;

    const forStory = (storyId: string) =>
      links
        .filter((l) => l.storyId === storyId)
        .map((l) => nameOf(l.labelId))
        .sort();

    expect(forStory("story-with-labels-01")).toEqual(["backend", "new"]);
    expect(
      links.find(
        (l) =>
          l.storyId === "story-with-labels-01" &&
          nameOf(l.labelId) === "backend",
      )?.labelId,
    ).toBe("label-existing");
    expect(
      links.find((l) => l.storyId === "story-other-project-02")?.labelId,
    ).toBe("label-other-project");
    expect(forStory("story-no-labels-03")).toEqual([]);
    expect(
      labels
        .filter((l) => l.projectId === P1)
        .map((l) => l.name)
        .sort(),
    ).toEqual(["backend", "new"]);
  });

  it("rejects a story_labels row whose label belongs to another project", async () => {
    const db = createDb(env.DB);
    await db
      .insert(projectLabelsTable)
      .values({ id: "label-p2", projectId: P2, name: "x" });
    await insertStory("story-p1-only-01", P1, []);

    await expect(
      env.DB.prepare(
        "insert into story_labels (project_id, story_id, label_id) values (?, ?, ?)",
      )
        .bind(P1, "story-p1-only-01", "label-p2")
        .run(),
    ).rejects.toThrow();
  });
});
