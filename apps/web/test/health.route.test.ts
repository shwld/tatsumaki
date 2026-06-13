import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "./helpers/db";

describe("health routes", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("returns health status on /health", async () => {
    const response = await SELF.fetch("http://localhost/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
