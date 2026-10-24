import { Hono } from "hono";
import { issueArtifactPreviewToken } from "../../../application/usecases/artifacts/artifact-content-access";
import { artifactError } from "../../../application/usecases/artifacts/errors";
import { D1ArtifactRepository } from "../../../infrastructure/db/repositories/d1-artifact-repository";
import type { Env } from "../../../index";
import { ARTIFACT_CONTENT_PATH_PREFIX } from "../artifact-content/routes";
import { requireArtifactAccess } from "./access";
import { artifactErrorResponse } from "./responses";
import { signingKeysFrom } from "./signing-keys";

/**
 * Session-authenticated only: this is mounted on /api, which API keys cannot
 * reach, so a key can never mint a preview token (ADR-0010 §5).
 */
export const artifactPreviewTokenRoute = new Hono<Env>();

artifactPreviewTokenRoute.post(
  "/projects/:projectId/artifacts/:artifactId/versions/:version/preview-token",
  async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireArtifactAccess(c, projectId, { write: false });
    if (!access.ok) return access.response;

    const versionParam = c.req.param("version");
    if (!/^[1-9][0-9]*$/.test(versionParam)) {
      return artifactErrorResponse(
        c,
        artifactError("VERSION_NOT_FOUND", "Version not found"),
      );
    }

    const keys = signingKeysFrom(c.env);
    if (!keys) {
      return c.json(
        {
          error: "Artifact preview is not configured",
          code: "PREVIEW_NOT_CONFIGURED",
        },
        503,
      );
    }

    const result = await issueArtifactPreviewToken(
      new D1ArtifactRepository(c.env.DB),
      keys,
      {
        projectId,
        artifactId: c.req.param("artifactId"),
        version: Number(versionParam),
        now: new Date(),
      },
    );
    if (result.isErr()) return artifactErrorResponse(c, result.error);

    const { token, expiresAt, entrypoint } = result.value;
    return c.json({
      token,
      expiresAt: expiresAt.toISOString(),
      contentPath: `${ARTIFACT_CONTENT_PATH_PREFIX}${token}/${entrypoint
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
    });
  },
);
