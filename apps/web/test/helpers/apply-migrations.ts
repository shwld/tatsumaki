import { env } from "cloudflare:test";
import { applyD1Migrations } from "cloudflare:test";

applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
