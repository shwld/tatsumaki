import { Hono } from "hono";
import type { Env } from "../../../../index";
import { cliV1ProjectsRoute } from "./projects";
import { cliV1VersionRoute } from "./version";
import { cliV1WhoamiRoute } from "./whoami";

export const cliV1Route = new Hono<Env>();
cliV1Route.route("/version", cliV1VersionRoute);
cliV1Route.route("/whoami", cliV1WhoamiRoute);
cliV1Route.route("/projects", cliV1ProjectsRoute);
