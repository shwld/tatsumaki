import { WorkerEntrypoint } from "cloudflare:workers";
import {
  OAuthProvider,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { Hono, type Context } from "hono";
import { recordBurndownSnapshotsAllActiveIterations } from "./application/usecases/burndown-chart";
import { cleanupArtifactsScheduled } from "./presentation/scheduled/cleanup-artifacts";
import { ensureIterationsForAllProjects } from "./presentation/scheduled/ensure-iterations";
import { healthRoute } from "./presentation/routes/health";
import { projectsRoute } from "./presentation/routes/projects";
import { storiesRoute } from "./presentation/routes/stories";
import { projectLabelsRoute } from "./presentation/routes/project-labels";
import { myWorkRoute } from "./presentation/routes/my-work";
import { authRoute } from "./presentation/routes/auth";
import { createEpicRoutes } from "./presentation/routes/epics/routes";
import { iterationsRoute } from "./presentation/routes/iterations";
import { mcpRoute } from "./presentation/routes/mcp";
import { cliRoute } from "./presentation/routes/cli";
import { planningPokerRoute } from "./presentation/routes/planning-poker";
import { storyMapLiveRoute } from "./presentation/routes/story-map-live";
import { projectHistoryRoute } from "./presentation/routes/project-history";
import { savedFiltersRoute } from "./presentation/routes/saved-filters";
import { projectApiKeysRoute } from "./presentation/routes/project-api-keys";
import { apiKeyRoute } from "./presentation/routes/api-key";
import { onboardingRoute } from "./presentation/routes/onboarding";
import { billingRoute } from "./presentation/routes/billing";
import { invitationLinksRoute } from "./presentation/routes/invitation-links";
import { artifactContentRoute } from "./presentation/routes/artifact-content/routes";
import {
  resolveSpaContentOrigin,
  routeByContentHost,
} from "./presentation/artifact-content-host";
import { artifactPreviewTokenRoute } from "./presentation/routes/artifacts/preview-token";
import {
  createArtifactArchiveRoutes,
  createArtifactPinRoutes,
  createArtifactReadRoutes,
} from "./presentation/routes/artifacts/routes";
import { isRateLimited } from "./presentation/rate-limit";
import { spaIndexHeaders } from "./presentation/spa-headers";
import { PlanningPokerDO } from "./durable-objects/planning-poker-do";
import { StoryMapDO } from "./durable-objects/story-map-do";
import { requireAccessAuth } from "./presentation/middleware/access-auth";
import {
  getAppEntitlementDenial,
  rejectBlockedUser,
  requireAppEntitlement,
} from "./presentation/middleware/app-entitlement";
import { devAuth } from "./presentation/middleware/dev-auth";
import {
  handleConsentDecision,
  renderConsentPage,
} from "./presentation/oauth-consent";
import { ACCESS_LOGIN_PATH } from "./presentation/cloudflare-access";
import {
  getCurrentUserFromAccessRequest,
  type CurrentUser,
} from "./presentation/middleware/access-auth";
import { handleMcpRequest } from "./presentation/routes/mcp";
import type { ControlPlaneRpc } from "./infrastructure/entitlements/control-plane-entitlement-provider";

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  STORY_ATTACHMENTS?: R2Bucket;
  USER_AVATARS?: R2Bucket;
  ARTIFACTS?: R2Bucket;
  ARTIFACT_CONTENT_SIGNING_KEY?: string;
  ARTIFACT_CONTENT_SIGNING_KEY_PREVIOUS?: string;
  ARTIFACT_CONTENT_ORIGIN?: string;
  ARTIFACT_APP_ORIGIN?: string;
  OAUTH_KV?: KVNamespace;
  ACCESS_AUD?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_JWKS_JSON?: string;
  DEV_AUTH_EMAIL?: string;
  PLANNING_POKER_DO: DurableObjectNamespace;
  STORY_MAP_DO: DurableObjectNamespace;
  CONTROL_PLANE?: ControlPlaneRpc;
  ENTITLEMENT_MODE?: string;
  CHECKOUT_ENABLED?: string;
  TERMS_URL?: string;
  PRIVACY_URL?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  ONBOARDING_RATE_LIMITER?: RateLimit;
  API_KEY_RATE_LIMITER?: RateLimit;
  OAUTH_REGISTER_RATE_LIMITER?: RateLimit;
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

app.use("/invite", async (c, next) => {
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

const api = new Hono<Env>();
api.route("/", healthRoute);

const protectedApi = new Hono<Env>();
protectedApi.use("*", devAuth());
protectedApi.use("*", requireAccessAuth());
protectedApi.use("/onboarding", rejectBlockedUser());
protectedApi.route("/", onboardingRoute);
protectedApi.use("*", requireAppEntitlement());
protectedApi.route("/", invitationLinksRoute);
protectedApi.route("/", authRoute);
protectedApi.route("/", projectsRoute);
protectedApi.route("/", storiesRoute);
protectedApi.route("/", projectLabelsRoute);
protectedApi.route("/projects", createEpicRoutes());
protectedApi.route("/", iterationsRoute);
protectedApi.route("/", planningPokerRoute);
protectedApi.route("/", storyMapLiveRoute);
protectedApi.route("/", projectHistoryRoute);
protectedApi.route("/", savedFiltersRoute);
protectedApi.route("/", myWorkRoute);
protectedApi.route("/", projectApiKeysRoute);
protectedApi.route("/", billingRoute);
protectedApi.route("/", artifactPreviewTokenRoute);
// The Web shows artifacts but never creates, edits or downloads them
// (ADR-0010 §7); those stay on the CLI / API key routes. Only personal pins and
// archive / restore are writes here.
protectedApi.route(
  "/projects",
  createArtifactReadRoutes({ readMiddleware: [] }),
);
protectedApi.route("/projects", createArtifactPinRoutes());
protectedApi.route(
  "/projects",
  createArtifactArchiveRoutes({ writeMiddleware: [] }),
);

api.route("/", protectedApi);

app.route("/api", api);
app.route("/api-key", apiKeyRoute);

const programmaticApi = new Hono<Env>();
programmaticApi.use("*", devAuth());
programmaticApi.use("*", requireAccessAuth());
programmaticApi.use("*", requireAppEntitlement());
programmaticApi.route("/", mcpRoute);
programmaticApi.route("/", cliRoute);

app.route(PROGRAMMATIC_API_BASE_PATH, programmaticApi);

// Authorized by capability token only; must stay ahead of the SPA fallback.
app.route("/", artifactContentRoute);

async function serveSpaIndex(c: Context<Env>) {
  const response = await c.env.ASSETS.fetch(
    new Request(new URL("/index.html", c.req.url)),
  );
  return new Response(response.body, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      ...spaIndexHeaders(
        new URL(c.req.url).origin,
        resolveSpaContentOrigin(c.env),
      ),
    },
  });
}

app.get("/login", serveSpaIndex);

app.get(
  "*",
  devAuth(),
  requireAccessAuth({ redirectOnFailure: true }),
  rejectBlockedUser(),
  serveSpaIndex,
);

class McpOAuthApiHandler extends WorkerEntrypoint<OAuthBindings> {
  async fetch(request: Request) {
    const props = this.ctx.props as OAuthUserProps | undefined;
    if (!props?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const currentUser: CurrentUser = {
      id: props.id,
      email: props.email,
    };

    const denial = await getAppEntitlementDenial(this.env.DB, currentUser.id);
    if (denial) {
      return Response.json(denial, { status: 403 });
    }

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
      const denial = await getAppEntitlementDenial(env.DB, currentUser.id);
      if (denial) {
        return Response.json(denial, { status: 403 });
      }

      if (request.method === "POST") {
        return handleConsentDecision(request, env, currentUser);
      }
      if (request.method === "GET") {
        return renderConsentPage(request, env, currentUser);
      }
      return new Response("Method not allowed", { status: 405 });
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
      authorization_servers: [origin],
      scopes_supported: ["mcp"],
      bearer_methods_supported: ["header"],
      resource_name: "tatsumaki API",
    },
  });
}

function isMcpOAuthEnabled(env: Bindings): env is OAuthBindings {
  return env.OAUTH_KV !== undefined && !env.DEV_AUTH_EMAIL;
}

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const contentHostResponse = await routeByContentHost(request, env, ctx);
    if (contentHostResponse) return contentHostResponse;

    if (!isMcpOAuthEnabled(env)) {
      return app.fetch(request, env, ctx);
    }

    if (
      request.method === "POST" &&
      new URL(request.url).pathname === "/oauth/register" &&
      (await isRateLimited(env.OAUTH_REGISTER_RATE_LIMITER, [
        `ip:${request.headers.get("cf-connecting-ip") ?? "unknown"}`,
      ]))
    ) {
      return Response.json(
        { error: "rate_limited", error_description: "Too many registrations" },
        { status: 429 },
      );
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
    // Independent of the iteration work above: neither can fail the other.
    ctx.waitUntil(cleanupArtifactsScheduled(env));
  },
};

export { PlanningPokerDO, StoryMapDO };
