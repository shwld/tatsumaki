import { WorkerEntrypoint } from "cloudflare:workers";
import {
  OAuthProvider,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { recordBurndownSnapshotsAllActiveIterations } from "./application/usecases/burndown-chart";
import { ensureIterationsForAllProjects } from "./presentation/scheduled/ensure-iterations";
import { healthRoute } from "./presentation/routes/health";
import { projectsRoute } from "./presentation/routes/projects";
import { storiesRoute } from "./presentation/routes/stories";
import { projectLabelsRoute } from "./presentation/routes/project-labels";
import { myWorkRoute } from "./presentation/routes/my-work";
import { authRoute } from "./presentation/routes/auth";
import { epicsRoute } from "./presentation/routes/epics";
import { iterationsRoute } from "./presentation/routes/iterations";
import { mcpRoute } from "./presentation/routes/mcp";
import { cliRoute } from "./presentation/routes/cli";
import { planningPokerRoute } from "./presentation/routes/planning-poker";
import { projectHistoryRoute } from "./presentation/routes/project-history";
import { savedFiltersRoute } from "./presentation/routes/saved-filters";
import { projectApiKeysRoute } from "./presentation/routes/project-api-keys";
import { apiKeyRoute } from "./presentation/routes/api-key";
import { PlanningPokerDO } from "./durable-objects/planning-poker-do";
import { requireAccessAuth } from "./presentation/middleware/access-auth";
import { devAuth } from "./presentation/middleware/dev-auth";
import { ACCESS_LOGIN_PATH } from "./presentation/cloudflare-access";
import {
  getCurrentUserFromAccessRequest,
  type CurrentUser,
} from "./presentation/middleware/access-auth";
import { handleMcpRequest } from "./presentation/routes/mcp";

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  STORY_ATTACHMENTS?: R2Bucket;
  USER_AVATARS?: R2Bucket;
  OAUTH_KV?: KVNamespace;
  ACCESS_AUD?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_JWKS_JSON?: string;
  DEV_AUTH_EMAIL?: string;
  PLANNING_POKER_DO: DurableObjectNamespace;
};

export type Env = {
  Bindings: Bindings;
};

type OAuthBindings = Bindings & {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
};

type OAuthUserProps = {
  id: string;
  email?: string;
};

const app = new Hono<Env>();
const PROGRAMMATIC_API_BASE_PATH = "/programmatic-api";

const api = new Hono<Env>();
api.route("/", healthRoute);

const protectedApi = new Hono<Env>();
protectedApi.use("*", devAuth());
protectedApi.use("*", requireAccessAuth());
protectedApi.route("/", authRoute);
protectedApi.route("/", projectsRoute);
protectedApi.route("/", storiesRoute);
protectedApi.route("/", projectLabelsRoute);
protectedApi.route("/", epicsRoute);
protectedApi.route("/", iterationsRoute);
protectedApi.route("/", planningPokerRoute);
protectedApi.route("/", projectHistoryRoute);
protectedApi.route("/", savedFiltersRoute);
protectedApi.route("/", myWorkRoute);
protectedApi.route("/", projectApiKeysRoute);

api.route("/", protectedApi);

app.route("/api", api);
app.route("/api-key", apiKeyRoute);

const programmaticApi = new Hono<Env>();
programmaticApi.use("*", devAuth());
programmaticApi.use("*", requireAccessAuth());
programmaticApi.route("/", mcpRoute);
programmaticApi.route("/", cliRoute);

app.route(PROGRAMMATIC_API_BASE_PATH, programmaticApi);

app.get("/login", async (c) => {
  return c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url)));
});

app.get(
  "*",
  devAuth(),
  requireAccessAuth({ redirectOnFailure: true }),
  async (c) => {
    return c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url)));
  },
);

class McpOAuthApiHandler extends WorkerEntrypoint<OAuthBindings> {
  fetch(request: Request) {
    const props = this.ctx.props as OAuthUserProps | undefined;
    if (!props?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const currentUser: CurrentUser = {
      id: props.id,
      email: props.email,
    };

    const url = new URL(request.url);
    if (url.pathname.startsWith(`${PROGRAMMATIC_API_BASE_PATH}/mcp`)) {
      return handleMcpRequest(request, this.env, currentUser);
    }
    if (url.pathname.startsWith(`${PROGRAMMATIC_API_BASE_PATH}/v1`)) {
      const cliApp = new Hono<Env>();
      cliApp.use("*", async (c, next) => {
        c.set("currentUser", currentUser);
        await next();
      });
      cliApp.route("/", cliRoute);
      const routedUrl = new URL(request.url);
      routedUrl.pathname = routedUrl.pathname.replace(
        PROGRAMMATIC_API_BASE_PATH,
        "",
      );
      const routedRequest = new Request(routedUrl, request);
      return cliApp.fetch(routedRequest, this.env, this.ctx);
    }

    return new Response("Not found", { status: 404 });
  }
}

const oauthDefaultHandler = {
  async fetch(
    request: Request,
    env: OAuthBindings,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/oauth/authorize") {
      const currentUser = await getCurrentUserFromAccessRequest(request, env);
      if (!currentUser) {
        return Response.redirect(new URL(ACCESS_LOGIN_PATH, request.url), 302);
      }

      const authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: authRequest,
        userId: currentUser.id,
        metadata: {
          email: currentUser.email ?? null,
        },
        scope: authRequest.scope.length > 0 ? authRequest.scope : ["mcp"],
        props: {
          id: currentUser.id,
          ...(currentUser.email ? { email: currentUser.email } : {}),
        },
      });

      return Response.redirect(redirectTo, 302);
    }

    return app.fetch(request, env, ctx);
  },
};

function createOAuthProvider(request: Request) {
  const origin = new URL(request.url).origin;
  const mcpApiRoute = `${origin}${PROGRAMMATIC_API_BASE_PATH}/mcp`;
  const cliApiRoute = `${origin}${PROGRAMMATIC_API_BASE_PATH}/v1`;

  return new OAuthProvider<OAuthBindings>({
    apiRoute: [mcpApiRoute, cliApiRoute],
    apiHandler: McpOAuthApiHandler,
    defaultHandler: oauthDefaultHandler,
    authorizeEndpoint: `${origin}/oauth/authorize`,
    tokenEndpoint: `${origin}/oauth/token`,
    clientRegistrationEndpoint: `${origin}/oauth/register`,
    scopesSupported: ["mcp"],
    allowPlainPKCE: false,
    resourceMetadata: {
      resource: mcpApiRoute,
      authorization_servers: [origin],
      scopes_supported: ["mcp"],
      bearer_methods_supported: ["header"],
      resource_name: "tatsumaki MCP",
    },
  });
}

function isMcpOAuthEnabled(env: Bindings): env is OAuthBindings {
  return env.OAUTH_KV !== undefined && !env.DEV_AUTH_EMAIL;
}

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    if (!isMcpOAuthEnabled(env)) {
      return app.fetch(request, env, ctx);
    }

    return createOAuthProvider(request).fetch(request, env, ctx);
  },
  async scheduled(
    _event: ScheduledEvent,
    env: Bindings,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      (async () => {
        await ensureIterationsForAllProjects(env.DB);
        const snapshotResult = await recordBurndownSnapshotsAllActiveIterations(
          env.DB,
        );
        if (snapshotResult.isErr()) {
          console.error(
            "Failed to record burndown snapshots:",
            snapshotResult.error,
          );
        } else {
          console.info("Burndown snapshots recorded", {
            activeIterationCount: snapshotResult.value.activeIterationCount,
          });
        }
      })(),
    );
  },
};

export { PlanningPokerDO };
