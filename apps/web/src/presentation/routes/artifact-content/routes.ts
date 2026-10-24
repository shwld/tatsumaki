import { Hono } from "hono";
import { readArtifactContent } from "../../../application/usecases/artifacts/artifact-content-access";
import { D1ArtifactRepository } from "../../../infrastructure/db/repositories/d1-artifact-repository";
import { R2ArtifactObjectStore } from "../../../infrastructure/storage/r2-artifact-object-store";
import type { Env } from "../../../index";
import { signingKeysFrom } from "../artifacts/signing-keys";
import {
  artifactContentDeniedHeaders,
  artifactContentHeaders,
  isAllowedArtifactContentFetch,
} from "./headers";

export const ARTIFACT_CONTENT_PATH_PREFIX = "/artifact-content/";

const CONTENT_PATH = /^\/artifact-content\/([^/]+)\/(.*)$/;

/**
 * Serves artifact files to the sandboxed preview iframe. The capability token
 * in the path is the only credential: this route is deliberately outside
 * every auth middleware, never reads cookies and is expected to be bypassed
 * by Cloudflare Access (ADR-0010 §4, §5).
 */
export const artifactContentRoute = new Hono<Env>();

artifactContentRoute.get("/artifact-content/*", async (c) => {
  const origin = new URL(c.req.url).origin;
  const deny = () =>
    new Response("Not found", {
      status: 404,
      headers: {
        ...artifactContentDeniedHeaders(origin),
        "Content-Type": "text/plain; charset=utf-8",
      },
    });

  // Match against the raw pathname: Hono's path may already be decoded.
  const match = CONTENT_PATH.exec(new URL(c.req.url).pathname);
  const keys = signingKeysFrom(c.env);
  if (
    !match ||
    !keys ||
    !c.env.ARTIFACTS ||
    !isAllowedArtifactContentFetch(c.req.raw.headers)
  ) {
    return deny();
  }
  const [, token, rawPath] = match as unknown as [string, string, string];

  // Errors are logged without the request URL, which carries the token.
  const result = await readArtifactContent(
    new D1ArtifactRepository(c.env.DB),
    new R2ArtifactObjectStore(c.env.ARTIFACTS),
    keys,
    { token, rawPath, now: new Date() },
  ).catch((error: unknown) => {
    console.error(
      "Artifact content failed",
      error instanceof Error ? error.name : "unknown",
    );
    return null;
  });
  if (!result || result.isErr()) {
    if (result?.isErr() && result.error.code === "STORAGE_ERROR") {
      console.error("Artifact content storage error");
    }
    return deny();
  }

  return new Response(result.value.object.body, {
    headers: {
      ...artifactContentHeaders(
        origin,
        `${origin}${ARTIFACT_CONTENT_PATH_PREFIX}${token}/`,
      ),
      "Content-Type": result.value.contentType,
      "Content-Length": String(result.value.object.size),
    },
  });
});
