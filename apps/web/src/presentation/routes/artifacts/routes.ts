import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { createArtifactUpload } from "../../../application/usecases/artifacts/create-artifact-upload";
import { artifactError } from "../../../application/usecases/artifacts/errors";
import { finalizeArtifactUpload } from "../../../application/usecases/artifacts/finalize-artifact-upload";
import {
  getArtifact,
  getArtifactFileContent,
  getArtifactVersion,
  listArtifactVersions,
  listArtifacts,
  updateArtifactMetadata,
} from "../../../application/usecases/artifacts/artifact-queries";
import { uploadArtifactFile } from "../../../application/usecases/artifacts/upload-artifact-file";
import type { ArtifactObjectStore } from "../../../application/ports/artifact-object-store";
import { ARTIFACT_LIMITS } from "../../../domain/entities/artifact";
import { D1ArtifactRepository } from "../../../infrastructure/db/repositories/d1-artifact-repository";
import { R2ArtifactObjectStore } from "../../../infrastructure/storage/r2-artifact-object-store";
import type { Env } from "../../../index";
import { requireArtifactAccess } from "./access";
import {
  artifactErrorResponse,
  toArtifactFileResponse,
  toArtifactResponse,
  toArtifactVersionResponse,
  toUploadSessionResponse,
} from "./responses";

type ArtifactRouteOptions = {
  /** Extra middleware per access level, e.g. API key scope checks. */
  readMiddleware: MiddlewareHandler<Env>[];
  writeMiddleware: MiddlewareHandler<Env>[];
};

const VERSION_PATTERN = /^[1-9][0-9]*$/;

function composeMiddleware(
  middleware: MiddlewareHandler<Env>[],
): MiddlewareHandler<Env> {
  return async (c, next) => {
    let response: Response | undefined;
    const run = async (index: number): Promise<void> => {
      const current = middleware[index];
      if (!current) {
        await next();
        return;
      }
      const result = await current(c, () => run(index + 1));
      if (result) response = result;
    };
    await run(0);
    return response;
  };
}

function objectStoreFor(
  bucket: R2Bucket | undefined,
): ArtifactObjectStore | null {
  return bucket ? new R2ArtifactObjectStore(bucket) : null;
}

function rawPathAfter(pathname: string, marker: RegExp): string | null {
  const match = marker.exec(pathname);
  return match?.[1] ?? null;
}

function contentDispositionFor(path: string): string {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

type ReadOptions = Pick<ArtifactRouteOptions, "readMiddleware">;
type WriteOptions = Pick<ArtifactRouteOptions, "writeMiddleware">;

/**
 * Listing, details, versions and a version's file manifest. No file contents
 * and no mutation, so this is also the only part the web app's session routes
 * (/api) mount: the Web has no create, edit or download UI (ADR-0010 §7).
 */
export function createArtifactReadRoutes(options: ReadOptions) {
  const app = new Hono<Env>();
  const readMw = composeMiddleware(options.readMiddleware);

  app.get("/:projectId/artifacts", readMw, async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireArtifactAccess(c, projectId, { write: false });
    if (!access.ok) return access.response;

    const result = await listArtifacts(new D1ArtifactRepository(c.env.DB), {
      projectId,
      archived: c.req.query("archived") === "true",
    });
    if (result.isErr()) return artifactErrorResponse(c, result.error);
    return c.json({ artifacts: result.value.map(toArtifactResponse) });
  });

  app.get("/:projectId/artifacts/:artifactId", readMw, async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireArtifactAccess(c, projectId, { write: false });
    if (!access.ok) return access.response;

    const result = await getArtifact(new D1ArtifactRepository(c.env.DB), {
      projectId,
      artifactId: c.req.param("artifactId"),
    });
    if (result.isErr()) return artifactErrorResponse(c, result.error);
    return c.json({
      artifact: toArtifactResponse(result.value.artifact),
      latestVersion: result.value.latest
        ? {
            ...toArtifactVersionResponse(result.value.latest.version),
            files: result.value.latest.files.map(toArtifactFileResponse),
          }
        : null,
    });
  });

  app.get("/:projectId/artifacts/:artifactId/versions", readMw, async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireArtifactAccess(c, projectId, { write: false });
    if (!access.ok) return access.response;

    const result = await listArtifactVersions(
      new D1ArtifactRepository(c.env.DB),
      { projectId, artifactId: c.req.param("artifactId") },
    );
    if (result.isErr()) return artifactErrorResponse(c, result.error);
    return c.json({ versions: result.value.map(toArtifactVersionResponse) });
  });

  app.get(
    "/:projectId/artifacts/:artifactId/versions/:version",
    readMw,
    async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireArtifactAccess(c, projectId, {
        write: false,
      });
      if (!access.ok) return access.response;

      const versionParam = c.req.param("version");
      if (!VERSION_PATTERN.test(versionParam)) {
        return artifactErrorResponse(
          c,
          artifactError("VERSION_NOT_FOUND", "Version not found"),
        );
      }

      const result = await getArtifactVersion(
        new D1ArtifactRepository(c.env.DB),
        {
          projectId,
          artifactId: c.req.param("artifactId"),
          version: Number(versionParam),
        },
      );
      if (result.isErr()) return artifactErrorResponse(c, result.error);
      return c.json({
        version: toArtifactVersionResponse(result.value.version),
        files: result.value.files.map(toArtifactFileResponse),
      });
    },
  );

  return app;
}

/** Downloading a version's files (CLI and API key access only). */
export function createArtifactFileRoutes(options: ReadOptions) {
  const app = new Hono<Env>();
  const readMw = composeMiddleware(options.readMiddleware);

  app.get(
    "/:projectId/artifacts/:artifactId/versions/:version/files/*",
    readMw,
    async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireArtifactAccess(c, projectId, {
        write: false,
      });
      if (!access.ok) return access.response;

      const versionParam = c.req.param("version");
      const rawPath = rawPathAfter(
        new URL(c.req.url).pathname,
        /\/versions\/[^/]+\/files\/(.+)$/,
      );
      if (!VERSION_PATTERN.test(versionParam) || rawPath === null) {
        return artifactErrorResponse(
          c,
          artifactError("FILE_NOT_FOUND", "File not found"),
        );
      }

      const objectStore = objectStoreFor(c.env.ARTIFACTS);
      if (!objectStore) {
        return c.json(
          {
            error: "Artifact storage is not configured",
            code: "STORAGE_ERROR",
          },
          503,
        );
      }

      const result = await getArtifactFileContent(
        new D1ArtifactRepository(c.env.DB),
        objectStore,
        {
          projectId,
          artifactId: c.req.param("artifactId"),
          version: Number(versionParam),
          rawPath,
        },
      );
      if (result.isErr()) return artifactErrorResponse(c, result.error);

      // This response is on the authenticated API origin, so it must never be
      // renderable or cacheable there.
      return new Response(result.value.object.body, {
        headers: {
          "Content-Type": result.value.contentType,
          "Content-Length": String(result.value.object.size),
          "Content-Disposition": contentDispositionFor(result.value.path),
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox",
          "Cache-Control": "private, no-store",
        },
      });
    },
  );

  return app;
}

/** Title and archive changes, and the upload / publish protocol. */
export function createArtifactWriteRoutes(options: WriteOptions) {
  const app = new Hono<Env>();
  const writeMw = composeMiddleware(options.writeMiddleware);

  app.patch("/:projectId/artifacts/:artifactId", writeMw, async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireArtifactAccess(c, projectId, { write: true });
    if (!access.ok) return access.response;

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.title !== "string") {
      return artifactErrorResponse(
        c,
        artifactError("INVALID_REQUEST", "title is required"),
      );
    }

    const result = await updateArtifactMetadata(
      new D1ArtifactRepository(c.env.DB),
      { projectId, artifactId: c.req.param("artifactId"), title: body.title },
    );
    if (result.isErr()) return artifactErrorResponse(c, result.error);
    return c.json({ artifact: toArtifactResponse(result.value) });
  });

  for (const [action, archived] of [
    ["archive", true],
    ["unarchive", false],
  ] as const) {
    app.post(
      `/:projectId/artifacts/:artifactId/${action}`,
      writeMw,
      async (c) => {
        const projectId = c.req.param("projectId");
        const access = await requireArtifactAccess(c, projectId, {
          write: true,
        });
        if (!access.ok) return access.response;

        const result = await updateArtifactMetadata(
          new D1ArtifactRepository(c.env.DB),
          { projectId, artifactId: c.req.param("artifactId"), archived },
        );
        if (result.isErr()) return artifactErrorResponse(c, result.error);
        return c.json({ artifact: toArtifactResponse(result.value) });
      },
    );
  }

  app.post("/:projectId/artifact-uploads", writeMw, async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireArtifactAccess(c, projectId, { write: false });
    if (!access.ok) return access.response;

    const body = await c.req.json().catch(() => null);
    const invalid = (message: string) =>
      artifactErrorResponse(c, artifactError("INVALID_REQUEST", message));
    if (!body || typeof body !== "object") return invalid("Invalid JSON body");
    if (
      typeof body.entrypoint !== "string" ||
      typeof body.treeDigest !== "string" ||
      !Array.isArray(body.files) ||
      (body.artifactId !== undefined && typeof body.artifactId !== "string") ||
      (body.title !== undefined && typeof body.title !== "string") ||
      (body.baseVersion !== undefined &&
        typeof body.baseVersion !== "number") ||
      !body.files.every(
        (file: unknown) =>
          typeof file === "object" &&
          file !== null &&
          typeof (file as { path?: unknown }).path === "string" &&
          typeof (file as { size?: unknown }).size === "number" &&
          typeof (file as { sha256?: unknown }).sha256 === "string",
      )
    ) {
      return invalid(
        "entrypoint, treeDigest and files[{path,size,sha256}] are required",
      );
    }

    const result = await createArtifactUpload(
      new D1ArtifactRepository(c.env.DB),
      {
        projectId,
        userId: access.userId,
        role: access.member.role,
        idempotencyKey: c.req.header("Idempotency-Key"),
        artifactId: body.artifactId,
        title: body.title,
        baseVersion: body.baseVersion,
        entrypoint: body.entrypoint,
        treeDigest: body.treeDigest,
        files: body.files.map(
          (file: { path: string; size: number; sha256: string }) => ({
            path: file.path,
            size: file.size,
            sha256: file.sha256,
          }),
        ),
      },
    );
    if (result.isErr()) return artifactErrorResponse(c, result.error);

    if (result.value.kind === "noop") {
      return c.json({
        noop: true,
        artifactId: result.value.artifact.id,
        version: result.value.version,
      });
    }
    return c.json(
      toUploadSessionResponse(result.value.session, result.value.uploadedPaths),
      201,
    );
  });

  app.put(
    "/:projectId/artifact-uploads/:sessionId/files/*",
    writeMw,
    async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireArtifactAccess(c, projectId, { write: true });
      if (!access.ok) return access.response;

      const rawPath = rawPathAfter(
        new URL(c.req.url).pathname,
        /\/artifact-uploads\/[^/]+\/files\/(.+)$/,
      );
      if (rawPath === null) {
        return artifactErrorResponse(
          c,
          artifactError(
            "FILE_NOT_IN_MANIFEST",
            "File is not part of this upload",
          ),
        );
      }
      const declaredLength = Number(c.req.header("Content-Length") ?? 0);
      if (declaredLength > ARTIFACT_LIMITS.fileBytes) {
        return artifactErrorResponse(
          c,
          artifactError("FILE_TOO_LARGE", "File is too large"),
        );
      }

      const objectStore = objectStoreFor(c.env.ARTIFACTS);
      if (!objectStore) {
        return c.json(
          {
            error: "Artifact storage is not configured",
            code: "STORAGE_ERROR",
          },
          503,
        );
      }

      const result = await uploadArtifactFile(
        new D1ArtifactRepository(c.env.DB),
        objectStore,
        {
          projectId,
          userId: access.userId,
          sessionId: c.req.param("sessionId"),
          rawPath,
          body: c.req.raw.body,
        },
      );
      if (result.isErr()) return artifactErrorResponse(c, result.error);
      return c.json(result.value);
    },
  );

  app.post(
    "/:projectId/artifact-uploads/:sessionId/finalize",
    writeMw,
    async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireArtifactAccess(c, projectId, { write: true });
      if (!access.ok) return access.response;

      const result = await finalizeArtifactUpload(
        new D1ArtifactRepository(c.env.DB),
        {
          projectId,
          userId: access.userId,
          sessionId: c.req.param("sessionId"),
        },
      );
      if (result.isErr()) return artifactErrorResponse(c, result.error);
      return c.json({ noop: false, ...result.value });
    },
  );

  return app;
}

/**
 * Artifact API shared by the OAuth/Access route (/programmatic-api/v1) and the
 * API key route (/api-key/v1). Mounted under ".../projects".
 */
export function createArtifactRoutes(options: ArtifactRouteOptions) {
  const app = new Hono<Env>();
  app.route("/", createArtifactReadRoutes(options));
  app.route("/", createArtifactFileRoutes(options));
  app.route("/", createArtifactWriteRoutes(options));
  return app;
}
