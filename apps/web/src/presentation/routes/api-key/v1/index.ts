import { Hono } from "hono";
import type { Env } from "../../../../index";
import {
  requireApiKeyAuth,
  requireApiKeyScope,
} from "../../../middleware/api-key-auth";
import { requireApiKeyForProject } from "../../artifacts/access";
import { createArtifactRoutes } from "../../artifacts/routes";
import { apiKeyV1StoriesRoute } from "./stories";

export const apiKeyV1Route = new Hono<Env>();

apiKeyV1Route.use("*", requireApiKeyAuth());
apiKeyV1Route.route("/projects", apiKeyV1StoriesRoute);
apiKeyV1Route.route(
  "/projects",
  createArtifactRoutes({
    readMiddleware: [
      requireApiKeyForProject(),
      requireApiKeyScope("artifact:read"),
    ],
    writeMiddleware: [
      requireApiKeyForProject(),
      requireApiKeyScope("artifact:write"),
    ],
  }),
);
