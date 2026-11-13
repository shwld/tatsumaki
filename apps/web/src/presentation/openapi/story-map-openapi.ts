import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { storyMapCommandSchema } from "../../application/usecases/story-map-commands";

const MapParamsSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .openapi({
      param: { name: "projectId", in: "path" },
      example: "project-123",
    }),
  mapId: z
    .string()
    .min(1)
    .openapi({ param: { name: "mapId", in: "path" }, example: "map-123" }),
});

const ProjectParamsSchema = MapParamsSchema.pick({ projectId: true });

const StoryMapSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    title: z.string(),
    achievementGoal: z.string(),
    archivedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("StoryMap");

const StoryMapStructureSchema = z
  .object({
    map: StoryMapSchema,
    activities: z.array(
      z.object({ id: z.string(), title: z.string(), position: z.number() }),
    ),
    tasks: z.array(
      z.object({
        id: z.string(),
        activityId: z.string(),
        title: z.string(),
        position: z.number(),
      }),
    ),
    slices: z.array(
      z.object({ id: z.string(), title: z.string(), position: z.number() }),
    ),
    cards: z.array(
      z.object({
        id: z.string(),
        taskId: z.string(),
        sliceId: z.string().nullable(),
        position: z.number(),
        ideaTitle: z.string().nullable(),
        note: z.string(),
        storyId: z.string().nullable(),
        storyState: z.enum(["idea", "linked", "missing"]),
        story: z
          .object({
            number: z.number().int(),
            title: z.string(),
            status: z.string(),
            type: z.string(),
            storyPoint: z.number().int().nullable(),
            isIcebox: z.boolean(),
          })
          .nullable(),
      }),
    ),
  })
  .openapi("StoryMapStructure");

const RoleSchema = z.string().openapi({ example: "member" });

const exampleMap: z.infer<typeof StoryMapSchema> = {
  id: "01KNCFJZJ0Z74X92QPCE0D9MK8",
  projectId: "project-123",
  title: "Onboarding",
  achievementGoal: "",
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const PREFIX = "/programmatic-api/v1/projects/{projectId}/story-maps";

export function registerStoryMapOpenApi(app: OpenAPIHono) {
  app.openapi(
    createRoute({
      operationId: "listStoryMaps",
      method: "get",
      path: PREFIX,
      request: {
        params: ProjectParamsSchema,
        query: z.object({
          includeArchived: z
            .enum(["true"])
            .optional()
            .openapi({ param: { name: "includeArchived", in: "query" } }),
        }),
      },
      responses: {
        200: {
          description: "Story maps of the project",
          content: {
            "application/json": {
              schema: z
                .object({
                  storyMaps: z.array(StoryMapSchema),
                  role: RoleSchema,
                })
                .openapi("StoryMapListResponse"),
            },
          },
        },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
      },
    }),
    (c) => c.json({ storyMaps: [exampleMap], role: "member" }),
  );

  app.openapi(
    createRoute({
      operationId: "createStoryMap",
      method: "post",
      path: PREFIX,
      request: {
        params: ProjectParamsSchema,
        body: {
          content: {
            "application/json": {
              schema: z
                .object({
                  title: z.string(),
                  achievementGoal: z.string().optional(),
                })
                .openapi("CreateStoryMapBody"),
            },
          },
        },
      },
      responses: {
        201: {
          description: "Created story map",
          content: {
            "application/json": {
              schema: z
                .object({ storyMap: StoryMapSchema })
                .openapi("StoryMapResponse"),
            },
          },
        },
        400: { description: "Invalid input. Body: { error, code }" },
        401: { description: "Unauthorized" },
        403: { description: "Viewers cannot create maps" },
      },
    }),
    (c) => c.json({ storyMap: exampleMap }, 201),
  );

  app.openapi(
    createRoute({
      operationId: "getStoryMap",
      method: "get",
      path: `${PREFIX}/{mapId}`,
      request: { params: MapParamsSchema },
      responses: {
        200: {
          description:
            "Whole structure of the map. Every element carries the ID later commands refer to",
          content: {
            "application/json": {
              schema: z
                .object({
                  structure: StoryMapStructureSchema,
                  role: RoleSchema,
                })
                .openapi("StoryMapStructureResponse"),
            },
          },
        },
        401: { description: "Unauthorized" },
        404: { description: "Story map not found. Body: { error, code }" },
      },
    }),
    (c) =>
      c.json({
        structure: {
          map: exampleMap,
          activities: [],
          tasks: [],
          slices: [],
          cards: [],
        },
        role: "member",
      }),
  );

  app.openapi(
    createRoute({
      operationId: "applyStoryMapCommand",
      method: "post",
      path: `${PREFIX}/{mapId}/commands`,
      request: {
        params: MapParamsSchema,
        body: {
          content: {
            "application/json": {
              schema: z
                .object({
                  opId: z
                    .string()
                    .describe(
                      "ULID chosen by the caller. Sending the same opId again returns the first result with duplicate: true",
                    ),
                  command: storyMapCommandSchema,
                })
                .openapi("StoryMapCommandBody"),
            },
          },
        },
      },
      responses: {
        200: {
          description:
            "Applied through the map's Durable Object, serialized with live edits",
          content: {
            "application/json": {
              schema: z
                .object({
                  seq: z.number().int(),
                  result: z.unknown().nullable(),
                  duplicate: z.boolean(),
                })
                .openapi("StoryMapCommandResponse"),
            },
          },
        },
        400: { description: "Invalid command. Body: { code: invalid }" },
        403: { description: "Viewers cannot edit. Body: { code: forbidden }" },
        404: {
          description:
            "Map or target element not found. Body: { code: not_found | target_gone }",
        },
        409: {
          description:
            "Body: { code: archived | story_unavailable | limit }. Archived maps reject edits; limit is the 2,000 card cap",
        },
        413: { description: "Body too large" },
        429: { description: "Body: { code: rate_limited }" },
      },
    }),
    (c) => c.json({ seq: 1, result: null, duplicate: false }),
  );
}
