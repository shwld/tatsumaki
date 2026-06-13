import { Hono } from "hono";
import type { Env } from "../../index";
import { apiKeyV1Route } from "./api-key/v1";

export const apiKeyRoute = new Hono<Env>();

apiKeyRoute.route("/v1", apiKeyV1Route);
