import { Hono } from "hono";
import type { Env } from "../../index";
import { cliV1Route } from "./cli/v1";

export const cliRoute = new Hono<Env>();

cliRoute.route("/v1", cliV1Route);
