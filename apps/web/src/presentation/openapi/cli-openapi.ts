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

const StorySchema = z
  .object({
    id: z.string().openapi({ example: "01KNCFJZJ0Z74X92QPCE0D9MK8" }),
    storyNumber: z.number().openapi({ example: 95 }),
    title: z.string().openapi({ example: "CLIを用意する" }),
    status: z.string().openapi({ example: "Started" }),
    type: z.string().openapi({ example: "feature" }),
  })
  .openapi("Story");

const StoryGetResponseSchema = z
  .object({
    story: StorySchema,
  })
  .openapi("StoryGetResponse");

const StoryListResponseSchema = z
  .object({
    stories: z.array(StorySchema),
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
    c.json({
      story: {
        id: "01KNCFJZJ0Z74X92QPCE0D9MK8",
        storyNumber: 95,
        title: "CLIを用意する",
        status: "Started",
        type: "feature",
      },
    }),
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
        story: {
          id: "01",
          storyNumber: 1,
          title: "x",
          status: "Unstarted",
          type: "feature",
        },
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
      story: {
        id: "01",
        storyNumber: 1,
        title: "x",
        status: "Started",
        type: "feature",
      },
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

  return app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: {
      title: "tatsumaki CLI API",
      version: "0.0.7",
    },
  });
}
