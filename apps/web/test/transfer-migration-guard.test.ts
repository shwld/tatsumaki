import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("transfer migration guard", () => {
  beforeEach(async () => {
    await env.DB.prepare(
      "CREATE TABLE transfer_guard_fixture (settlement_status TEXT)",
    ).run();
    await env.DB.prepare(
      "CREATE TABLE transfer_migration_guard (allowed INTEGER NOT NULL CHECK (allowed = 1))",
    ).run();
  });
  afterEach(async () => {
    await env.DB.prepare("DROP TABLE IF EXISTS transfer_migration_guard").run();
    await env.DB.prepare("DROP TABLE IF EXISTS transfer_guard_fixture").run();
  });
  async function check() {
    const migration = env.TEST_MIGRATIONS.find(
      (item) => item.name === "0081_transfer_notification_contract.sql",
    );
    if (!migration) throw new Error("migration not found");
    const guard = migration.queries.find((query) =>
      /INSERT INTO transfer_migration_guard/.test(query),
    );
    if (!guard) throw new Error("guard not found");
    return env.DB.prepare(
      guard.replace("project_ownership_transfers", "transfer_guard_fixture"),
    ).run();
  }
  it.each(["pending", "review"])("rejects %s settlement", async (status) => {
    await env.DB.prepare("INSERT INTO transfer_guard_fixture VALUES (?)")
      .bind(status)
      .run();
    await expect(check()).rejects.toThrow();
  });
  it("allows a migration after settlement", async () => {
    await env.DB.prepare(
      "INSERT INTO transfer_guard_fixture VALUES ('settled'), (NULL)",
    ).run();
    await expect(check()).resolves.toMatchObject({ success: true });
  });
});
