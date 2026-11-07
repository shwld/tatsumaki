import { Hono } from "hono";
import type { Bindings, Env } from "../index";
import { artifactContentRoute } from "./routes/artifact-content/routes";
import { resolveArtifactContentConfig } from "./routes/artifacts/preview-policy";

/** Origin the SPA may frame; the app itself unless a content site is set. */
export function resolveSpaContentOrigin(env: Bindings): string | undefined {
  const config = resolveArtifactContentConfig(env);
  return config.mode === "split" ? config.contentOrigin : undefined;
}

/**
 * Content host app: only `/artifact-content/*`, with no authentication,
 * session, OAuth or SPA fallback (ADR-0012 §2).
 */
const contentHostApp = new Hono<Env>();
contentHostApp.route("/", artifactContentRoute);
contentHostApp.all(
  "*",
  () =>
    new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }),
);

/**
 * ADR-0012 §2: once `ARTIFACT_CONTENT_ORIGIN` is set, requests for that host
 * are served by `contentHostApp` alone, and the app host never serves
 * `/artifact-content/*`. Returns null when the normal app should handle it.
 */
export function routeByContentHost(
  request: Request,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<Response> | Response | null {
  const configured = env.ARTIFACT_CONTENT_ORIGIN;
  if (!configured) return null;

  const url = new URL(request.url);
  if (url.origin === configured) {
    return contentHostApp.fetch(request, env, ctx);
  }
  if (url.pathname.startsWith("/artifact-content/")) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return null;
}
