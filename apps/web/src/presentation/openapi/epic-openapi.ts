import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { EPIC_OUTCOME_STATUSES } from "../../domain/entities/epic";
import { EPIC_PROGRESS_STATES } from "../../domain/entities/epic-progress";

const LabelParamsSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .openapi({
      param: { name: "projectId", in: "path" },
      example: "project-123",
    }),
  labelId: z
    .string()
    .min(1)
    .openapi({ param: { name: "labelId", in: "path" }, example: "label-123" }),
});

const ProjectParamsSchema = LabelParamsSchema.pick({ projectId: true });

const LabelSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    color: z.string().openapi({ example: "#3b82f6" }),
  })
  .openapi("Label");

export const EpicSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    labelId: z.string(),
    labelName: z.string(),
    labelColor: z.string(),
    enabled: z.boolean(),
    description: z.string(),
    ownerIds: z.array(z.string()),
    plannedStart: z.string().nullable().openapi({ example: "2026-11-01" }),
    plannedEnd: z.string().nullable().openapi({ example: "2026-12-31" }),
    position: z.number().int(),
    outcomeStatus: z.enum(EPIC_OUTCOME_STATUSES),
    revision: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Epic");

const StoryCountsSchema = z
  .object({
    total: z.number().int(),
    accepted: z.number().int(),
    inProgress: z
      .number()
      .int()
      .describe("Started, Finished, Delivered or Rejected, outside the Icebox"),
    unstarted: z.number().int().describe("Unstarted, outside the Icebox"),
    icebox: z.number().int().describe("Not accepted and in the Icebox"),
    blocked: z
      .number()
      .int()
      .describe("Not accepted and waiting on a blocker; overlaps other counts"),
  })
  .openapi("EpicStoryCounts");

const EpicProgressSchema = z
  .object({
    state: z.enum(EPIC_PROGRESS_STATES),
    storyCompletionRate: z
      .number()
      .nullable()
      .describe("Accepted ÷ all stories with the label; null without stories"),
    stories: StoryCountsSchema,
    pointCompletionRate: z
      .number()
      .nullable()
      .describe(
        "Accepted points ÷ points of estimated features; null when none is estimated",
      ),
    points: z.object({
      estimatedPoints: z.number().int(),
      acceptedPoints: z.number().int(),
      excludedStories: z
        .number()
        .int()
        .describe(
          "Stories outside the point basis: not features or unestimated",
        ),
    }),
    overdue: z
      .boolean()
      .describe("The planned end has passed and a story is not accepted"),
  })
  .openapi("EpicProgress");

const EpicWithProgressSchema = z
  .object({ epic: EpicSchema, progress: EpicProgressSchema })
  .openapi("EpicWithProgress");

const EpicStorySchema = z
  .object({
    id: z.string(),
    storyNumber: z.number().int(),
    title: z.string(),
    type: z.string(),
    status: z.string(),
    isIcebox: z.boolean(),
    isBlocked: z.boolean(),
    storyPoint: z.number().int().nullable(),
  })
  .openapi("EpicStory");

const EpicResponseSchema = z
  .object({ epic: EpicSchema })
  .openapi("EpicResponse");

const RevisionSchema = z.number().int().min(1);

const EnableEpicBodySchema = z
  .object({ revision: RevisionSchema.optional() })
  .openapi("EnableEpicBody");

const DisableEpicBodySchema = z
  .object({ revision: RevisionSchema })
  .openapi("DisableEpicBody");

const UpdateEpicPlanBodySchema = z
  .object({
    revision: RevisionSchema,
    description: z.string().optional(),
    ownerIds: z.array(z.string()).optional(),
    plannedStart: z.string().nullable().optional(),
    plannedEnd: z.string().nullable().optional(),
    outcomeStatus: z.enum(EPIC_OUTCOME_STATUSES).optional(),
  })
  .openapi("UpdateEpicPlanBody");

const epicError = (summary: string) => ({
  description: `${summary}. Body: { error, code }`,
});

const exampleEpic: z.infer<typeof EpicSchema> = {
  id: "01KNCFJZJ0Z74X92QPCE0D9MK8",
  projectId: "project-123",
  labelId: "label-123",
  labelName: "onboarding",
  labelColor: "#3b82f6",
  enabled: true,
  description: "",
  ownerIds: [],
  plannedStart: null,
  plannedEnd: null,
  position: 1,
  outcomeStatus: "unevaluated",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const exampleCounts: z.infer<typeof StoryCountsSchema> = {
  total: 0,
  accepted: 0,
  inProgress: 0,
  unstarted: 0,
  icebox: 0,
  blocked: 0,
};

const exampleProgress: z.infer<typeof EpicProgressSchema> = {
  state: "no_stories",
  storyCompletionRate: null,
  stories: exampleCounts,
  pointCompletionRate: null,
  points: { estimatedPoints: 0, acceptedPoints: 0, excludedStories: 0 },
  overdue: false,
};

const PREFIX = "/programmatic-api/v1/projects/{projectId}";

export function registerEpicOpenApi(app: OpenAPIHono) {
  app.openapi(
    createRoute({
      operationId: "listLabels",
      method: "get",
      path: `${PREFIX}/labels`,
      request: { params: ProjectParamsSchema },
      responses: {
        200: {
          description: "Labels of the project",
          content: {
            "application/json": {
              schema: z
                .object({ labels: z.array(LabelSchema) })
                .openapi("LabelListResponse"),
            },
          },
        },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
      },
    }),
    (c) => c.json({ labels: [] }),
  );

  app.openapi(
    createRoute({
      operationId: "listEpics",
      method: "get",
      path: `${PREFIX}/epics`,
      request: { params: ProjectParamsSchema },
      responses: {
        200: {
          description: "Epics of the project, with planning on or off",
          content: {
            "application/json": {
              schema: z
                .object({ epics: z.array(EpicSchema) })
                .openapi("EpicListResponse"),
            },
          },
        },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
      },
    }),
    (c) => c.json({ epics: [exampleEpic] }),
  );

  app.openapi(
    createRoute({
      operationId: "listEpicProgress",
      method: "get",
      path: `${PREFIX}/epics/progress`,
      request: { params: ProjectParamsSchema },
      responses: {
        200: {
          description:
            "Epics with planning on, with progress aggregated from their stories on read. total counts a story shared by several epics once",
          content: {
            "application/json": {
              schema: z
                .object({
                  epics: z.array(EpicWithProgressSchema),
                  total: StoryCountsSchema,
                })
                .openapi("EpicProgressListResponse"),
            },
          },
        },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
      },
    }),
    (c) => c.json({ epics: [], total: exampleCounts }),
  );

  app.openapi(
    createRoute({
      operationId: "getLabelEpicProgress",
      method: "get",
      path: `${PREFIX}/labels/{labelId}/epic/progress`,
      request: { params: LabelParamsSchema },
      responses: {
        200: {
          description:
            "The epic with its progress and the stories carrying its label",
          content: {
            "application/json": {
              schema: EpicWithProgressSchema.extend({
                stories: z.array(EpicStorySchema),
              }).openapi("EpicProgressDetailResponse"),
            },
          },
        },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        404: epicError(
          "Label not found, planning never turned on, or planning is off",
        ),
      },
    }),
    (c) =>
      c.json({
        epic: exampleEpic,
        progress: exampleProgress,
        stories: [],
      }),
  );

  app.openapi(
    createRoute({
      operationId: "getLabelEpic",
      method: "get",
      path: `${PREFIX}/labels/{labelId}/epic`,
      request: { params: LabelParamsSchema },
      responses: {
        200: {
          description: "The label's epic",
          content: { "application/json": { schema: EpicResponseSchema } },
        },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        404: epicError("Label not found, or planning never turned on"),
      },
    }),
    (c) => c.json({ epic: exampleEpic }),
  );

  app.openapi(
    createRoute({
      operationId: "enableLabelEpic",
      method: "post",
      path: `${PREFIX}/labels/{labelId}/epic/enable`,
      request: {
        params: LabelParamsSchema,
        body: {
          content: { "application/json": { schema: EnableEpicBodySchema } },
        },
      },
      responses: {
        200: {
          description:
            "Planning is on. The first time creates the epic; later it restores the saved plan",
          content: { "application/json": { schema: EpicResponseSchema } },
        },
        400: epicError("Invalid request body"),
        401: { description: "Unauthorized" },
        403: epicError("Forbidden"),
        404: epicError("Label not found"),
        409: epicError("Revision required or stale"),
      },
    }),
    (c) => c.json({ epic: exampleEpic }),
  );

  app.openapi(
    createRoute({
      operationId: "disableLabelEpic",
      method: "post",
      path: `${PREFIX}/labels/{labelId}/epic/disable`,
      request: {
        params: LabelParamsSchema,
        body: {
          content: { "application/json": { schema: DisableEpicBodySchema } },
        },
      },
      responses: {
        200: {
          description: "Planning is off; the plan is kept",
          content: { "application/json": { schema: EpicResponseSchema } },
        },
        400: epicError("Invalid request body"),
        401: { description: "Unauthorized" },
        403: epicError("Forbidden"),
        404: epicError("Label or epic not found"),
        409: epicError("Stale revision"),
      },
    }),
    (c) => c.json({ epic: { ...exampleEpic, enabled: false } }),
  );

  app.openapi(
    createRoute({
      operationId: "updateLabelEpicPlan",
      method: "patch",
      path: `${PREFIX}/labels/{labelId}/epic`,
      request: {
        params: LabelParamsSchema,
        body: {
          content: { "application/json": { schema: UpdateEpicPlanBodySchema } },
        },
      },
      responses: {
        200: {
          description: "Plan saved",
          content: { "application/json": { schema: EpicResponseSchema } },
        },
        400: epicError("Invalid plan"),
        401: { description: "Unauthorized" },
        403: epicError("Forbidden"),
        404: epicError("Label or epic not found"),
        409: epicError("Stale revision"),
      },
    }),
    (c) => c.json({ epic: exampleEpic }),
  );

  app.openapi(
    createRoute({
      operationId: "getLabelDeletionImpact",
      method: "get",
      path: `${PREFIX}/labels/{labelId}/deletion-impact`,
      request: { params: LabelParamsSchema },
      responses: {
        200: {
          description:
            "What deleting the label also removes: its story memberships and its epic with the plan",
          content: {
            "application/json": {
              schema: z
                .object({
                  labelId: z.string(),
                  labelName: z.string(),
                  storyCount: z.number().int(),
                  epic: z
                    .object({
                      id: z.string(),
                      enabled: z.boolean(),
                      hasPlan: z.boolean(),
                    })
                    .nullable(),
                })
                .openapi("LabelDeletionImpact"),
            },
          },
        },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        404: epicError("Label not found"),
      },
    }),
    (c) =>
      c.json({
        labelId: "label-123",
        labelName: "onboarding",
        storyCount: 0,
        epic: null,
      }),
  );
}
