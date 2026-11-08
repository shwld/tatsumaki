import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/infrastructure/db/client";
import { projectLabelsTable } from "../src/infrastructure/db/schema/project-labels";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import { storiesTable } from "../src/infrastructure/db/schema/stories";
import { resetDatabase } from "./helpers/db";

const P1 = "01JNMVQ8Q9Y6P5KH1XZ4V7C2T1";
const P2 = "01JNMVQ8Q9Y6P5KH1XZ4V7C2T2";

async function rerunConnection() {
  const migration = env.TEST_MIGRATIONS.find(
    (item) => item.name === "0061_connect_epics_to_same_name_labels.sql",
  );
  if (!migration) throw new Error("migration 0061 not found");
  for (const query of migration.queries) {
    await env.DB.prepare(query).run();
  }
}

async function insertLegacyEpic(id: string, projectId: string, name: string) {
  await env.DB.prepare(
    "INSERT INTO epics (id, project_id, name, description) VALUES (?, ?, ?, ?)",
  )
    .bind(id, projectId, name, `${name} purpose`)
    .run();
}

async function insertStory(id: string, projectId: string, epicId: string) {
  await createDb(env.DB)
    .insert(storiesTable)
    .values({
      id,
      storyNumber: Number.parseInt(id.slice(-2), 10),
      projectId,
      title: id,
      description: "-",
      position: 1,
      epicId,
    });
}

describe("0061_connect_epics_to_same_name_labels", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await env.DB.prepare("DELETE FROM epics").run();
    await createDb(env.DB)
      .insert(projectsTable)
      .values([
        { id: P1, name: "One" },
        { id: P2, name: "Two" },
      ]);
  });

  it("connects epics to same-named labels, creates missing labels and gives the label to the epic's stories", async () => {
    await createDb(env.DB)
      .insert(projectLabelsTable)
      .values([
        { id: "label-onboarding", projectId: P1, name: "onboarding" },
        { id: "label-p2-billing", projectId: P2, name: "billing" },
      ]);
    await insertLegacyEpic("epic-onboarding", P1, "onboarding");
    await insertLegacyEpic("epic-billing", P1, "billing");
    await insertStory("story-onboarding-01", P1, "epic-onboarding");
    await insertStory("story-billing-02", P1, "epic-billing");

    await rerunConnection();

    const epics = await env.DB.prepare(
      `SELECT e.id, e.label_id, e.enabled, e.description, e.position, pl.name AS label_name, pl.project_id AS label_project
       FROM epics e JOIN project_labels pl ON pl.id = e.label_id ORDER BY e.id`,
    ).all();
    expect(epics.results).toEqual([
      {
        id: "epic-billing",
        label_id: expect.any(String),
        enabled: 1,
        description: "billing purpose",
        position: 1,
        label_name: "billing",
        label_project: P1,
      },
      {
        id: "epic-onboarding",
        label_id: "label-onboarding",
        enabled: 1,
        description: "onboarding purpose",
        position: 2,
        label_name: "onboarding",
        label_project: P1,
      },
    ]);
    expect(epics.results[0]?.label_id).not.toBe("label-p2-billing");

    const memberships = await env.DB.prepare(
      `SELECT sl.story_id, pl.name FROM story_labels sl JOIN project_labels pl ON pl.id = sl.label_id ORDER BY sl.story_id`,
    ).all();
    expect(memberships.results).toEqual([
      { story_id: "story-billing-02", name: "billing" },
      { story_id: "story-onboarding-01", name: "onboarding" },
    ]);

    await rerunConnection();
    const labelCount = await env.DB.prepare(
      "SELECT count(*) AS n FROM project_labels WHERE project_id = ?",
    )
      .bind(P1)
      .first<{ n: number }>();
    expect(labelCount?.n).toBe(2);
  });

  it("refuses a label from another project at the database", async () => {
    await createDb(env.DB)
      .insert(projectLabelsTable)
      .values({ id: "label-p2", projectId: P2, name: "foreign" });

    await expect(
      env.DB.prepare(
        "INSERT INTO epics (id, project_id, name, label_id) VALUES ('e', ?, 'x', 'label-p2')",
      )
        .bind(P1)
        .run(),
    ).rejects.toThrow(/same project/);
  });
});
