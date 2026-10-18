import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { STORY_STATUSES, STORY_TYPES } from "../../domain/entities/story";
import { getCliVersionCompatibility } from "../../application/usecases/get-cli-version-compatibility";

const StoryStatusEnumSchema = z
  .enum(STORY_STATUSES)
  .openapi("StoryStatus", { example: "Unstarted" });

const ProjectIdParamSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .openapi({
      param: { name: "projectId", in: "path" },
      example: "project-123",
    }),
});

const StoryByNumberParamsSchema = ProjectIdParamSchema.extend({
  storyNumber: z
    .string()
    .min(1)
    .openapi({ param: { name: "storyNumber", in: "path" }, example: "95" }),
});

const StoryListQuerySchema = z.object({
  status: StoryStatusEnumSchema.optional().openapi({
    param: { name: "status", in: "query" },
  }),
  iterationDateScope: z
    .literal("current")
    .optional()
    .openapi({
      param: { name: "iterationDateScope", in: "query" },
      example: "current",
    }),
  limit: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .optional()
    .openapi({
      param: { name: "limit", in: "query" },
      example: "10",
    }),
});

const StorySummarySchema = z
  .object({
    id: z.string().openapi({ example: "01KNCFJZJ0Z74X92QPCE0D9MK8" }),
    storyNumber: z.number().openapi({ example: 95 }),
    title: z.string().openapi({ example: "CLIを用意する" }),
    status: z.string().openapi({ example: "Started" }),
    type: z.string().openapi({ example: "feature" }),
  })
  .openapi("StorySummary");

const StoryRelationSchema = z
  .object({ id: z.string(), title: z.string() })
  .openapi("StoryRelation");

export const StoryDetailSchema = StorySummarySchema.extend({
  projectId: z.string(),
  description: z.string().openapi({ example: "## Plan\n..." }),
  statusChangedAt: z.string(),
  completedAt: z.string().nullable(),
  storyPoint: z.number().int().nullable(),
  labels: z.array(z.string()),
  epicId: z.string().nullable(),
  iterationId: z.string().nullable(),
  isIcebox: z.boolean(),
  ownerIds: z.array(z.string()),
  requesterId: z.string().nullable(),
  releaseDate: z.string().nullable(),
  position: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isBlocked: z.boolean().optional(),
  isBlocking: z.boolean().optional(),
  blockingStories: z.array(StoryRelationSchema).optional(),
  blockedStories: z.array(StoryRelationSchema).optional(),
}).openapi("Story");

const storyDetailExample = (
  overrides: Partial<z.infer<typeof StoryDetailSchema>> = {},
): z.infer<typeof StoryDetailSchema> => ({
  id: "01KNCFJZJ0Z74X92QPCE0D9MK8",
  storyNumber: 95,
  title: "CLIを用意する",
  status: "Started",
  type: "feature",
  projectId: "project-123",
  description: "details",
  statusChangedAt: "2026-01-01 00:00:00",
  completedAt: null,
  storyPoint: null,
  labels: [],
  epicId: null,
  iterationId: null,
  isIcebox: false,
  ownerIds: [],
  requesterId: null,
  releaseDate: null,
  position: 1,
  createdAt: "2026-01-01 00:00:00",
  updatedAt: "2026-01-01 00:00:00",
  ...overrides,
});

const StoryGetResponseSchema = z
  .object({
    story: StoryDetailSchema,
  })
  .openapi("StoryGetResponse");

const StoryListResponseSchema = z
  .object({
    stories: z.array(StorySummarySchema),
  })
  .openapi("StoryListResponse");
const StoryCreateBodySchema = z.object({
  title: z.string(),
  type: z.enum(STORY_TYPES),
  description: z.string(),
  isIcebox: z.boolean().optional(),
});
const StoryReorderBodySchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});
const StoryUpdateBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(STORY_TYPES).optional(),
  storyPoint: z.number().int().nullable().optional(),
  labels: z.array(z.string()).optional(),
  isIcebox: z.boolean().optional(),
  status: StoryStatusEnumSchema.optional(),
});
const StoryCommentBodySchema = z.object({
  body: z.string().min(1),
});

const ArtifactSchema = z
  .object({
    id: z.string().openapi({ example: "01KNCFJZJ0Z74X92QPCE0D9MK8" }),
    projectId: z.string(),
    title: z.string(),
    archivedAt: z.string().nullable(),
    latestVersion: z.number().int().nullable(),
    createdBy: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Artifact");
const ArtifactVersionSchema = z
  .object({
    artifactId: z.string(),
    version: z.number().int(),
    entrypoint: z.string(),
    treeDigest: z.string(),
    fileCount: z.number().int(),
    totalBytes: z.number().int(),
    sessionId: z.string().nullable(),
    createdBy: z.string(),
    createdAt: z.string(),
  })
  .openapi("ArtifactVersion");
const ArtifactFileSchema = z
  .object({
    path: z.string(),
    size: z.number().int(),
    sha256: z.string(),
    contentType: z.string(),
  })
  .openapi("ArtifactFile");
const ArtifactResponseSchema = z
  .object({ artifact: ArtifactSchema })
  .openapi("ArtifactResponse");
const ArtifactListResponseSchema = z
  .object({ artifacts: z.array(ArtifactSchema) })
  .openapi("ArtifactListResponse");
const ArtifactDetailResponseSchema = z
  .object({
    artifact: ArtifactSchema,
    latestVersion: ArtifactVersionSchema.extend({
      files: z.array(ArtifactFileSchema),
    }).nullable(),
  })
  .openapi("ArtifactDetailResponse");
const ArtifactVersionListResponseSchema = z
  .object({ versions: z.array(ArtifactVersionSchema) })
  .openapi("ArtifactVersionListResponse");
const ArtifactVersionDetailResponseSchema = z
  .object({
    version: ArtifactVersionSchema,
    files: z.array(ArtifactFileSchema),
  })
  .openapi("ArtifactVersionDetailResponse");
const ArtifactUploadTreeSchema = z.object({
  entrypoint: z.string(),
  treeDigest: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      size: z.number().int().min(0),
      sha256: z.string(),
    }),
  ),
});
const ArtifactUploadNewBodySchema = ArtifactUploadTreeSchema.extend({
  title: z.string(),
}).openapi("ArtifactUploadNewBody");
const ArtifactUploadUpdateBodySchema = ArtifactUploadTreeSchema.extend({
  artifactId: z.string(),
  baseVersion: z.number().int().min(1),
}).openapi("ArtifactUploadUpdateBody");
const ArtifactUploadCreateBodySchema = z
  .union([ArtifactUploadNewBodySchema, ArtifactUploadUpdateBodySchema])
  .openapi("ArtifactUploadCreateBody");
const ArtifactUploadSessionSchema = z
  .object({
    noop: z.literal(false),
    sessionId: z.string(),
    artifactId: z.string(),
    baseVersion: z.number().int().nullable(),
    status: z.enum(["pending", "published", "expired"]),
    expiresAt: z.string(),
    uploadedPaths: z.array(z.string()),
  })
  .openapi("ArtifactUploadSession");
const ArtifactUploadNoopSchema = z
  .object({
    noop: z.literal(true),
    artifactId: z.string(),
    version: z.number().int(),
  })
  .openapi("ArtifactUploadNoop");
const ArtifactUploadCreateResponseSchema = z
  .union([ArtifactUploadSessionSchema, ArtifactUploadNoopSchema])
  .openapi("ArtifactUploadCreateResponse");
const ArtifactFinalizeResponseSchema = z
  .object({
    noop: z.literal(false),
    artifactId: z.string(),
    version: z.number().int(),
  })
  .openapi("ArtifactFinalizeResponse");
const ArtifactParamsSchema = ProjectIdParamSchema.extend({
  artifactId: z.string().openapi({ param: { name: "artifactId", in: "path" } }),
});
const ArtifactVersionParamsSchema = ArtifactParamsSchema.extend({
  version: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .openapi({ param: { name: "version", in: "path" }, example: "1" }),
});
const ArtifactVersionFileParamsSchema = ArtifactVersionParamsSchema.extend({
  path: z.string().openapi({
    param: { name: "path", in: "path" },
    description: "File path inside the version; may contain slashes",
    example: "assets/app.js",
  }),
});
const ArtifactUploadSessionParamsSchema = ProjectIdParamSchema.extend({
  sessionId: z.string().openapi({ param: { name: "sessionId", in: "path" } }),
});
const ArtifactUploadFileParamsSchema = ArtifactUploadSessionParamsSchema.extend(
  {
    path: z.string().openapi({
      param: { name: "path", in: "path" },
      description: "File path in the manifest; may contain slashes",
    }),
  },
);
const ArtifactListQuerySchema = z.object({
  archived: z
    .enum(["true", "false"])
    .optional()
    .openapi({ param: { name: "archived", in: "query" } }),
});
const ArtifactUploadHeadersSchema = z.object({
  "Idempotency-Key": z
    .string()
    .min(1)
    .max(255)
    .openapi({
      param: { name: "Idempotency-Key", in: "header" },
    }),
});
const ArtifactTitleBodySchema = z.object({ title: z.string() });

const ProjectSchema = z
  .object({
    id: z.string().openapi({ example: "01KN9P32R248P2PK1413DKQQG5" }),
    name: z.string().openapi({ example: "tatsumaki" }),
  })
  .openapi("Project");

const ProjectGetResponseSchema = z
  .object({
    project: ProjectSchema,
  })
  .openapi("ProjectGetResponse");

const CliVersionCompatibilityResponseSchema = z
  .object({
    apiVersion: z
      .string()
      .openapi({ example: getCliVersionCompatibility().apiVersion }),
    minClientVersion: z
      .string()
      .openapi({ example: getCliVersionCompatibility().minClientVersion }),
  })
  .openapi("CliVersionCompatibilityResponse");

const CliWhoamiResponseSchema = z
  .object({
    id: z.string().openapi({ example: "01KN9P32R248P2PK1413DKQQG5" }),
    email: z.string().email().openapi({ example: "user@example.com" }),
    displayName: z.string().openapi({ example: "Taro" }),
  })
  .openapi("CliWhoamiResponse");

export function buildCliOpenApiDoc() {
  const app = new OpenAPIHono();

  const getStoryByNumberRoute = createRoute({
    operationId: "getStoryByNumber",
    method: "get",
    path: "/programmatic-api/v1/projects/{projectId}/stories/{storyNumber}",
    request: {
      params: StoryByNumberParamsSchema,
    },
    responses: {
      200: {
        description: "Story found",
        content: {
          "application/json": {
            schema: StoryGetResponseSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
      },
      404: {
        description: "Story not found",
      },
    },
  });

  app.openapi(getStoryByNumberRoute, (c) =>
    c.json({ story: storyDetailExample() }),
  );

  const listStoriesRoute = createRoute({
    operationId: "listStories",
    method: "get",
    path: "/programmatic-api/v1/projects/{projectId}/stories",
    request: {
      params: ProjectIdParamSchema,
      query: StoryListQuerySchema,
    },
    responses: {
      200: {
        description: "Stories matching the filter",
        content: {
          "application/json": {
            schema: StoryListResponseSchema,
          },
        },
      },
      400: {
        description: "Invalid query parameters",
      },
      401: {
        description: "Unauthorized",
      },
      403: {
        description: "Forbidden",
      },
    },
  });

  app.openapi(listStoriesRoute, (c) =>
    c.json({
      stories: [
        {
          id: "01KNCFJZJ0Z74X92QPCE0D9MK8",
          storyNumber: 95,
          title: "CLIを用意する",
          status: "Started",
          type: "feature",
        },
      ],
    }),
  );

  const createStoryRoute = createRoute({
    operationId: "createStory",
    method: "post",
    path: "/programmatic-api/v1/projects/{projectId}/stories",
    request: {
      params: ProjectIdParamSchema,
      body: {
        content: {
          "application/json": { schema: StoryCreateBodySchema },
        },
      },
    },
    responses: {
      201: {
        description: "Story created",
        content: { "application/json": { schema: StoryGetResponseSchema } },
      },
      400: { description: "Invalid request body" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      409: { description: "Conflict" },
    },
  });
  app.openapi(createStoryRoute, (c) =>
    c.json(
      {
        story: storyDetailExample({
          id: "01",
          storyNumber: 1,
          title: "x",
          status: "Unstarted",
        }),
      },
      201,
    ),
  );

  const reorderStoriesRoute = createRoute({
    operationId: "reorderStories",
    method: "post",
    path: "/programmatic-api/v1/projects/{projectId}/stories/reorder",
    request: {
      params: ProjectIdParamSchema,
      body: {
        content: { "application/json": { schema: StoryReorderBodySchema } },
      },
    },
    responses: {
      200: {
        description: "Stories reordered",
        content: { "application/json": { schema: StoryListResponseSchema } },
      },
      400: { description: "Invalid request body" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
    },
  });
  app.openapi(reorderStoriesRoute, (c) => c.json({ stories: [] }));

  const updateStoryRoute = createRoute({
    operationId: "updateStory",
    method: "patch",
    path: "/programmatic-api/v1/projects/{projectId}/stories/{storyNumber}",
    request: {
      params: StoryByNumberParamsSchema,
      body: {
        content: { "application/json": { schema: StoryUpdateBodySchema } },
      },
    },
    responses: {
      200: {
        description: "Story updated",
        content: { "application/json": { schema: StoryGetResponseSchema } },
      },
      400: { description: "Invalid request body" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Story not found" },
      409: { description: "Conflict" },
    },
  });
  app.openapi(updateStoryRoute, (c) =>
    c.json({
      story: storyDetailExample({ id: "01", storyNumber: 1, title: "x" }),
    }),
  );

  const createStoryCommentRoute = createRoute({
    operationId: "createStoryComment",
    method: "post",
    path: "/programmatic-api/v1/projects/{projectId}/stories/{storyNumber}/comments",
    request: {
      params: StoryByNumberParamsSchema,
      body: {
        content: { "application/json": { schema: StoryCommentBodySchema } },
      },
    },
    responses: {
      201: { description: "Comment created" },
      400: { description: "Invalid request body" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Story not found" },
    },
  });
  app.openapi(createStoryCommentRoute, (c) =>
    c.json({ comment: { id: "c1", body: "x" } }, 201),
  );

  const getProjectRoute = createRoute({
    operationId: "getProject",
    method: "get",
    path: "/programmatic-api/v1/projects/{projectId}",
    request: {
      params: ProjectIdParamSchema,
    },
    responses: {
      200: {
        description: "Project found",
        content: {
          "application/json": {
            schema: ProjectGetResponseSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
      },
      403: {
        description: "Forbidden",
      },
      404: {
        description: "Project not found",
      },
    },
  });

  app.openapi(getProjectRoute, (c) =>
    c.json({
      project: {
        id: "01KN9P32R248P2PK1413DKQQG5",
        name: "tatsumaki",
      },
    }),
  );

  const versionRoute = createRoute({
    operationId: "getCliVersionCompatibility",
    method: "get",
    path: "/programmatic-api/v1/version",
    responses: {
      200: {
        description: "CLI compatibility versions",
        content: {
          "application/json": {
            schema: CliVersionCompatibilityResponseSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
      },
    },
  });

  app.openapi(versionRoute, (c) => c.json(getCliVersionCompatibility()));

  const whoamiRoute = createRoute({
    operationId: "getCliWhoami",
    method: "get",
    path: "/programmatic-api/v1/whoami",
    responses: {
      200: {
        description: "Current CLI user",
        content: {
          "application/json": {
            schema: CliWhoamiResponseSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
      },
    },
  });

  app.openapi(whoamiRoute, (c) =>
    c.json({
      id: "01KN9P32R248P2PK1413DKQQG5",
      email: "user@example.com",
      displayName: "Taro",
    }),
  );

  const listArtifactsRoute = createRoute({
    operationId: "listArtifacts",
    method: "get",
    path: "/programmatic-api/v1/projects/{projectId}/artifacts",
    request: {
      params: ProjectIdParamSchema,
      query: ArtifactListQuerySchema,
    },
    responses: {
      200: {
        description: "Artifacts",
        content: { "application/json": { schema: ArtifactListResponseSchema } },
      },
      401: { description: "Unauthorized" },
      404: {
        description: "Not found",
      },
    },
  });
  app.openapi(listArtifactsRoute, (c) => c.json({ artifacts: [] }));

  const getArtifactRoute = createRoute({
    operationId: "getArtifact",
    method: "get",
    path: "/programmatic-api/v1/projects/{projectId}/artifacts/{artifactId}",
    request: {
      params: ArtifactParamsSchema,
    },
    responses: {
      200: {
        description: "Artifact with its latest version",
        content: {
          "application/json": { schema: ArtifactDetailResponseSchema },
        },
      },
      401: { description: "Unauthorized" },
      404: {
        description: "Not found",
      },
    },
  });
  app.openapi(getArtifactRoute, (c) =>
    c.json({
      artifact: {
        id: "01",
        projectId: "p",
        title: "x",
        archivedAt: null,
        latestVersion: 1,
        createdBy: "u",
        createdAt: "t",
        updatedAt: "t",
      },
      latestVersion: null,
    }),
  );

  const updateArtifactRoute = createRoute({
    operationId: "updateArtifact",
    method: "patch",
    path: "/programmatic-api/v1/projects/{projectId}/artifacts/{artifactId}",
    request: {
      params: ArtifactParamsSchema,
      body: {
        content: { "application/json": { schema: ArtifactTitleBodySchema } },
      },
    },
    responses: {
      200: {
        description: "Artifact updated; no new version is created",
        content: { "application/json": { schema: ArtifactResponseSchema } },
      },
      401: { description: "Unauthorized" },
      400: {
        description: "Invalid request",
      },
      403: {
        description: "Forbidden",
      },
      404: {
        description: "Not found",
      },
    },
  });
  app.openapi(updateArtifactRoute, (c) =>
    c.json({
      artifact: {
        id: "01",
        projectId: "p",
        title: "x",
        archivedAt: null,
        latestVersion: 1,
        createdBy: "u",
        createdAt: "t",
        updatedAt: "t",
      },
    }),
  );

  const archiveArtifactRoute = createRoute({
    operationId: "archiveArtifact",
    method: "post",
    path: "/programmatic-api/v1/projects/{projectId}/artifacts/{artifactId}/archive",
    request: {
      params: ArtifactParamsSchema,
    },
    responses: {
      200: {
        description: "Artifact archived",
        content: { "application/json": { schema: ArtifactResponseSchema } },
      },
      401: { description: "Unauthorized" },
      403: {
        description: "Forbidden",
      },
      404: {
        description: "Not found",
      },
    },
  });
  app.openapi(archiveArtifactRoute, (c) =>
    c.json({
      artifact: {
        id: "01",
        projectId: "p",
        title: "x",
        archivedAt: null,
        latestVersion: 1,
        createdBy: "u",
        createdAt: "t",
        updatedAt: "t",
      },
    }),
  );

  const unarchiveArtifactRoute = createRoute({
    operationId: "unarchiveArtifact",
    method: "post",
    path: "/programmatic-api/v1/projects/{projectId}/artifacts/{artifactId}/unarchive",
    request: {
      params: ArtifactParamsSchema,
    },
    responses: {
      200: {
        description: "Artifact unarchived",
        content: { "application/json": { schema: ArtifactResponseSchema } },
      },
      401: { description: "Unauthorized" },
      403: {
        description: "Forbidden",
      },
      404: {
        description: "Not found",
      },
    },
  });
  app.openapi(unarchiveArtifactRoute, (c) =>
    c.json({
      artifact: {
        id: "01",
        projectId: "p",
        title: "x",
        archivedAt: null,
        latestVersion: 1,
        createdBy: "u",
        createdAt: "t",
        updatedAt: "t",
      },
    }),
  );

  const listArtifactVersionsRoute = createRoute({
    operationId: "listArtifactVersions",
    method: "get",
    path: "/programmatic-api/v1/projects/{projectId}/artifacts/{artifactId}/versions",
    request: {
      params: ArtifactParamsSchema,
    },
    responses: {
      200: {
        description: "Versions, newest first",
        content: {
          "application/json": { schema: ArtifactVersionListResponseSchema },
        },
      },
      401: { description: "Unauthorized" },
      404: {
        description: "Not found",
      },
    },
  });
  app.openapi(listArtifactVersionsRoute, (c) => c.json({ versions: [] }));

  const getArtifactVersionRoute = createRoute({
    operationId: "getArtifactVersion",
    method: "get",
    path: "/programmatic-api/v1/projects/{projectId}/artifacts/{artifactId}/versions/{version}",
    request: {
      params: ArtifactVersionParamsSchema,
    },
    responses: {
      200: {
        description: "Version with its file manifest",
        content: {
          "application/json": { schema: ArtifactVersionDetailResponseSchema },
        },
      },
      401: { description: "Unauthorized" },
      404: {
        description: "Not found",
      },
    },
  });
  app.openapi(getArtifactVersionRoute, (c) =>
    c.json({
      version: {
        artifactId: "01",
        version: 1,
        entrypoint: "index.html",
        treeDigest: "d",
        fileCount: 1,
        totalBytes: 1,
        sessionId: null,
        createdBy: "u",
        createdAt: "t",
      },
      files: [],
    }),
  );

  const downloadArtifactFileRoute = createRoute({
    operationId: "downloadArtifactFile",
    method: "get",
    path: "/programmatic-api/v1/projects/{projectId}/artifacts/{artifactId}/versions/{version}/files/{path}",
    request: { params: ArtifactVersionFileParamsSchema },
    responses: {
      200: {
        description:
          "File bytes with the server-decided Content-Type, nosniff and a sandbox CSP",
        content: {
          "application/octet-stream": {
            schema: z.string().openapi({ format: "binary" }),
          },
        },
      },
      401: { description: "Unauthorized" },
      404: {
        description: "Not found",
      },
    },
  });
  app.openapi(downloadArtifactFileRoute, (c) => c.body("", 200));

  const createArtifactUploadRoute = createRoute({
    operationId: "createArtifactUpload",
    method: "post",
    path: "/programmatic-api/v1/projects/{projectId}/artifact-uploads",
    request: {
      params: ProjectIdParamSchema,
      headers: ArtifactUploadHeadersSchema,
      body: {
        content: {
          "application/json": { schema: ArtifactUploadCreateBodySchema },
        },
      },
    },
    responses: {
      201: {
        description:
          "Upload session created, or replayed for the same Idempotency-Key",
        content: {
          "application/json": { schema: ArtifactUploadCreateResponseSchema },
        },
      },
      200: {
        description:
          "The tree equals the latest version (noop: true); nothing was created",
        content: {
          "application/json": { schema: ArtifactUploadCreateResponseSchema },
        },
      },
      401: { description: "Unauthorized" },
      400: {
        description: "Invalid request",
      },
      403: {
        description: "Forbidden",
      },
      404: {
        description: "Not found",
      },
      409: {
        description: "Conflict",
      },
      413: {
        description: "Payload too large",
      },
      415: {
        description: "Unsupported media type",
      },
      422: {
        description: "Unprocessable",
      },
    },
  });
  app.openapi(createArtifactUploadRoute, (c) =>
    c.json(
      {
        noop: false as const,
        sessionId: "s",
        artifactId: "a",
        baseVersion: null,
        status: "pending" as const,
        expiresAt: "t",
        uploadedPaths: [],
      },
      201,
    ),
  );

  const uploadArtifactFileRoute = createRoute({
    operationId: "uploadArtifactFile",
    method: "put",
    path: "/programmatic-api/v1/projects/{projectId}/artifact-uploads/{sessionId}/files/{path}",
    request: {
      params: ArtifactUploadFileParamsSchema,
      body: {
        required: true,
        content: {
          "application/octet-stream": {
            schema: z.string().openapi({ format: "binary" }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "File stored",
        content: {
          "application/json": {
            schema: z.object({
              path: z.string(),
              uploadedCount: z.number().int(),
            }),
          },
        },
      },
      401: { description: "Unauthorized" },
      403: {
        description: "Forbidden",
      },
      404: {
        description: "Not found",
      },
      410: {
        description: "Upload session expired",
      },
      413: {
        description: "Payload too large",
      },
      422: {
        description: "Unprocessable",
      },
    },
  });
  app.openapi(uploadArtifactFileRoute, (c) =>
    c.json({ path: "x", uploadedCount: 1 }),
  );

  const finalizeArtifactUploadRoute = createRoute({
    operationId: "finalizeArtifactUpload",
    method: "post",
    path: "/programmatic-api/v1/projects/{projectId}/artifact-uploads/{sessionId}/finalize",
    request: {
      params: ArtifactUploadSessionParamsSchema,
    },
    responses: {
      200: {
        description:
          "Version published; repeating the call returns the same result",
        content: {
          "application/json": { schema: ArtifactFinalizeResponseSchema },
        },
      },
      401: { description: "Unauthorized" },
      403: {
        description: "Forbidden",
      },
      404: {
        description: "Not found",
      },
      409: {
        description: "Conflict",
      },
      410: {
        description: "Upload session expired",
      },
    },
  });
  app.openapi(finalizeArtifactUploadRoute, (c) =>
    c.json({ noop: false as const, artifactId: "a", version: 1 }),
  );

  return app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: {
      title: "tatsumaki CLI API",
      version: "0.0.10",
    },
  });
}
