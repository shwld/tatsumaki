import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/infrastructure/db/client";
import { projectLabelsTable } from "../src/infrastructure/db/schema/project-labels";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import { resetDatabase } from "./helpers/db";

const P1 = "01JNMVQ8Q9Y6P5KH1XZ4V7C2T1";
const P2 = "01JNMVQ8Q9Y6P5KH1XZ4V7C2T2";

async function convertSavedFilters() {
  const migration = env.TEST_MIGRATIONS.find(
    (item) => item.name === "0065_contract_epic_label_binding.sql",
  );
  if (!migration) throw new Error("migration 0065 not found");
  await env.DB.prepare("DELETE FROM saved_filter_epic_conversion_report").run();
  for (const query of migration.queries) {
    if (/^\s*(INSERT|UPDATE)/i.test(query)) {
      await env.DB.prepare(query).run();
    }
  }
}

async function insertEpic(id: string, projectId: string, labelId: string) {
  await env.DB.prepare(
    "INSERT INTO epics (id, project_id, label_id, enabled) VALUES (?, ?, ?, 1)",
  )
    .bind(id, projectId, labelId)
    .run();
}

async function insertFilter(id: string, projectId: string, filters: unknown) {
  await env.DB.prepare(
    "INSERT INTO saved_filters (id, project_id, owner_user_id, name, filters, visibility) VALUES (?, ?, 'u', ?, ?, 'project')",
  )
    .bind(id, projectId, id, JSON.stringify(filters))
    .run();
}

async function readFilter(id: string) {
  const row = await env.DB.prepare(
    "SELECT filters FROM saved_filters WHERE id = ?",
  )
    .bind(id)
    .first<{ filters: string }>();
  return JSON.parse(row?.filters ?? "null");
}

describe("0065_contract_epic_label_binding", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await env.DB.prepare("DELETE FROM epics").run();
    await env.DB.prepare("DELETE FROM saved_filters").run();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, display_name, email) VALUES ('u', 'U', 'u@example.com')",
    ).run();
    await createDb(env.DB)
      .insert(projectsTable)
      .values([
        { id: P1, name: "One" },
        { id: P2, name: "Two" },
      ]);
    await createDb(env.DB)
      .insert(projectLabelsTable)
      .values([
        { id: "label-a", projectId: P1, name: "a" },
        { id: "label-b", projectId: P1, name: "b" },
        { id: "label-p2", projectId: P2, name: "p2" },
      ]);
  });

  it("drops the legacy columns", async () => {
    const stories = await env.DB.prepare("PRAGMA table_info(stories)").all<{
      name: string;
    }>();
    const epics = await env.DB.prepare("PRAGMA table_info(epics)").all<{
      name: string;
    }>();
    expect(stories.results.map((c) => c.name)).not.toContain("epic_id");
    expect(epics.results.map((c) => c.name)).not.toContain("name");
  });

  it("turns epic conditions into the label conditions of the connected epics, keeps existing label conditions and reports what cannot convert", async () => {
    await insertEpic("epic-a", P1, "label-a");
    await insertEpic("epic-b", P1, "label-b");
    await insertEpic("epic-p2", P2, "label-p2");
    await insertFilter("f1", P1, {
      query: "x",
      labelIds: ["label-b"],
      epicIds: ["epic-a", "epic-b"],
    });
    await insertFilter("f4", P1, {
      epicIds: ["epic-b", "epic-gone", "epic-p2"],
    });
    await insertFilter("f2", P1, { epicIds: ["epic-a"] });
    await insertFilter("f3", P1, { query: "plain" });

    await convertSavedFilters();

    const f1 = await readFilter("f1");
    expect(f1.epicIds).toBeUndefined();
    expect(f1.labelIds).toEqual(["label-b"]);
    expect(f1.query).toBe("x");
    expect(await readFilter("f4")).toEqual({ labelIds: ["label-b"] });
    expect(await readFilter("f2")).toEqual({ labelIds: ["label-a"] });
    expect(await readFilter("f3")).toEqual({ query: "plain" });

    const report = await env.DB.prepare(
      "SELECT saved_filter_id, epic_id FROM saved_filter_epic_conversion_report ORDER BY saved_filter_id, epic_id",
    ).all();
    expect(report.results).toEqual([
      { saved_filter_id: "f1", epic_id: "epic-a" },
      { saved_filter_id: "f1", epic_id: "epic-b" },
      { saved_filter_id: "f4", epic_id: "epic-gone" },
      { saved_filter_id: "f4", epic_id: "epic-p2" },
    ]);
  });

  it("refuses a label from another project at the database", async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO epics (id, project_id, label_id) VALUES ('e', ?, 'label-p2')",
      )
        .bind(P1)
        .run(),
    ).rejects.toThrow(/same project/);
  });
});
