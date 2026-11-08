import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/infrastructure/db/client";
import { projectLabelsTable } from "../src/infrastructure/db/schema/project-labels";
import { projectsTable } from "../src/infrastructure/db/schema/projects";
import { usersTable } from "../src/infrastructure/db/schema/users";
import { resetDatabase } from "./helpers/db";

const P1 = "01JNMVQ8Q9Y6P5KH1XZ4V7C2T1";
const P2 = "01JNMVQ8Q9Y6P5KH1XZ4V7C2T2";

async function rerunConversion() {
  const migration = env.TEST_MIGRATIONS.find(
    (item) => item.name === "0062_convert_saved_filter_labels_to_ids.sql",
  );
  if (!migration) throw new Error("migration 0062 not found");
  for (const query of migration.queries) {
    const statement = query.trim().toUpperCase();
    if (statement.startsWith("INSERT") || statement.startsWith("UPDATE")) {
      await env.DB.prepare(query).run();
    }
  }
}

describe("0062_convert_saved_filter_labels_to_ids", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await env.DB.prepare("DELETE FROM saved_filters").run();
    await env.DB.prepare(
      "DELETE FROM saved_filter_label_conversion_report",
    ).run();
    const db = createDb(env.DB);
    await db
      .insert(usersTable)
      .values({ id: "u1", email: "u1@example.com", displayName: "U1" });
    await db.insert(projectsTable).values([
      { id: P1, name: "One" },
      { id: P2, name: "Two" },
    ]);
    await db.insert(projectLabelsTable).values([
      { id: "label-backend", projectId: P1, name: "backend" },
      { id: "label-api", projectId: P1, name: "api" },
      { id: "label-other-project", projectId: P2, name: "ui" },
    ]);
  });

  async function insertFilter(id: string, projectId: string, filters: object) {
    await env.DB.prepare(
      "INSERT INTO saved_filters (id, project_id, owner_user_id, name, filters) VALUES (?, ?, 'u1', ?, ?)",
    )
      .bind(id, projectId, id, JSON.stringify(filters))
      .run();
  }

  async function filtersOf(id: string) {
    const row = await env.DB.prepare(
      "SELECT filters FROM saved_filters WHERE id = ?",
    )
      .bind(id)
      .first<{ filters: string }>();
    return JSON.parse(row?.filters ?? "{}");
  }

  it("turns label names into IDs of the same project, drops unknown names and reports them", async () => {
    await insertFilter("f1", P1, {
      query: "x",
      labels: ["backend", "api", "ui", "gone"],
    });
    await insertFilter("f2", P1, { query: "no labels" });

    await rerunConversion();

    const converted = await filtersOf("f1");
    expect(converted.labels).toBeUndefined();
    expect(converted.query).toBe("x");
    expect([...converted.labelIds].sort()).toEqual([
      "label-api",
      "label-backend",
    ]);
    expect(await filtersOf("f2")).toEqual({ query: "no labels" });

    const report = await env.DB.prepare(
      "SELECT saved_filter_id, label_name FROM saved_filter_label_conversion_report ORDER BY label_name",
    ).all<{ saved_filter_id: string; label_name: string }>();
    expect(report.results).toEqual([
      { saved_filter_id: "f1", label_name: "gone" },
      { saved_filter_id: "f1", label_name: "ui" },
    ]);
  });

  it("leaves an empty labelIds when no name can be converted", async () => {
    await insertFilter("f3", P1, { labels: ["gone"] });

    await rerunConversion();

    expect(await filtersOf("f3")).toEqual({ labelIds: [] });
  });
});
