import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/infrastructure/db/client";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import { storiesTable } from "../src/infrastructure/db/schema/stories";
import { resetDatabase } from "./helpers/db";

async function applyMigration() {
  const migration = env.TEST_MIGRATIONS.find(
    (item) => item.name === "0051_icebox_requires_unstarted.sql",
  );
  if (!migration) throw new Error("migration 0051 not found");
  for (const query of migration.queries) {
    await env.DB.prepare(query).run();
  }
}

const PROJECT_ID = "01JNMVQ8Q9Y6P5KH1XZ4V7C2TA";

async function insertStory(
  id: string,
  status: string,
  isIcebox: number,
  iterationId: string | null = null,
) {
  const timestamp = new Date().toISOString();
  await createDb(env.DB)
    .insert(storiesTable)
    .values({
      id,
      storyNumber: Number.parseInt(id.slice(-2), 10),
      projectId: PROJECT_ID,
      title: id,
      description: "-",
      type: "feature",
      status,
      storyPoint: 3,
      labels: "[]",
      iterationId,
      position: 1,
      isIcebox,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
}

describe("0051_icebox_requires_unstarted", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await createDb(env.DB)
      .insert(projectsTable)
      .values({ id: PROJECT_ID, name: "Project" });
  });

  it("takes non-Unstarted Icebox stories out of the Icebox and leaves the rest", async () => {
    await insertStory("story-icebox-unstarted-01", "Unstarted", 1);
    await insertStory("story-icebox-started-02", "Started", 1);
    await insertStory("story-icebox-finished-03", "Finished", 1);
    await insertStory("story-icebox-delivered-04", "Delivered", 1);
    await insertStory("story-icebox-rejected-05", "Rejected", 1);
    await insertStory("story-icebox-accepted-06", "Accepted", 1);
    await insertStory("story-backlog-started-07", "Started", 0);

    await applyMigration();

    const rows = await createDb(env.DB).select().from(storiesTable).all();
    const byId = new Map(rows.map((row) => [row.id, row.isIcebox]));
    expect(byId.get("story-icebox-unstarted-01")).toBe(1);
    for (const id of [
      "story-icebox-started-02",
      "story-icebox-finished-03",
      "story-icebox-delivered-04",
      "story-icebox-rejected-05",
      "story-icebox-accepted-06",
    ]) {
      expect(byId.get(id)).toBe(0);
    }
    expect(byId.get("story-backlog-started-07")).toBe(0);
  });

  it("does not touch iteration assignment or status", async () => {
    await insertStory("story-icebox-started-10", "Started", 1);
    await applyMigration();

    const row = await createDb(env.DB)
      .select()
      .from(storiesTable)
      .where(eq(storiesTable.id, "story-icebox-started-10"))
      .get();
    expect(row).toMatchObject({ status: "Started", iterationId: null });
  });
});
