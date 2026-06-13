import { Hono } from "hono";
import { getCliVersionCompatibility } from "../../../../application/usecases/get-cli-version-compatibility";
import type { Env } from "../../../../index";

export const cliV1VersionRoute = new Hono<Env>();

cliV1VersionRoute.get("/", async (c) => {
  return c.json(getCliVersionCompatibility());
});
