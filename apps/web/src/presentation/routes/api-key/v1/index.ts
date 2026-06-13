import { Hono } from "hono";
import type { Env } from "../../../../index";
import { requireApiKeyAuth } from "../../../middleware/api-key-auth";
import { apiKeyV1StoriesRoute } from "./stories";

export const apiKeyV1Route = new Hono<Env>();

apiKeyV1Route.use("*", requireApiKeyAuth());
apiKeyV1Route.route("/projects", apiKeyV1StoriesRoute);
