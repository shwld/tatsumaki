import { Hono } from "hono";
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { createAssigneeCommentNotifications } from "../../application/usecases/create-assignee-comment-notifications";
import { createStory } from "../../application/usecases/create-story";
import { createStoryComment } from "../../application/usecases/create-story-comment";
import { getProject } from "../../application/usecases/get-project";
import { getStory } from "../../application/usecases/get-story";
import { listStories } from "../../application/usecases/list-stories";
import { reorderStories } from "../../application/usecases/reorder-stories";
import { updateStory } from "../../application/usecases/update-story";
import { STORY_STATUSES, STORY_TYPES } from "../../domain/entities/story";
import { getPointScale } from "../../domain/entities/project";
import type { ProjectRepository } from "../../domain/repositories/project-repository";
import { D1StoryActivityRepository } from "../../infrastructure/db/repositories/d1-story-activity-repository";
import { D1NotificationRepository } from "../../infrastructure/db/repositories/d1-notification-repository";
import { D1IterationRepository } from "../../infrastructure/db/repositories/d1-iteration-repository";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
import { D1StoryCommentRepository } from "../../infrastructure/db/repositories/d1-story-comment-repository";
import { D1StoryRepository } from "../../infrastructure/db/repositories/d1-story-repository";
import type { Env } from "../../index";
import { todayIso } from "../../shared/date/today-iso";
import { parseStoryNumberReference } from "../lib/story-number-reference";
import type { CurrentUser } from "../middleware/access-auth";
import { STORY_COMMENT_NOT_FOUND_ERROR } from "../../domain/repositories/story-comment-repository";
import {
  toCreateStoryErrorResponse,
  toReorderStoriesErrorResponse,
  toUpdateStoryErrorResponse,
} from "./stories/error-responses";

type McpRequestContext = {
  db: D1Database;
  currentUser: CurrentUser;
};

async function requireProjectAccess(
  projectRepository: ProjectRepository,
  projectId: string,
  userId: string,
) {
  const memberResult = await projectRepository.findMember(projectId, userId);

  if (memberResult.isErr()) {
    return {
      ok: false as const,
      response: {
        content: [
          {
            type: "text" as const,
            text: "Failed to verify project membership.",
          },
        ],
        isError: true,
      },
    };
  }

  if (!memberResult.value) {
    return {
      ok: false as const,
      response: {
        content: [
          {
            type: "text" as const,
            text: "You do not have access to this project.",
          },
        ],
        isError: true,
      },
    };
  }

  return { ok: true as const, member: memberResult.value };
}

const mcpStoryReferenceSchemaFields = {
  storyId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The story ID (ULID). Provide exactly one of storyId or storyNumber.",
    ),
  storyNumber: z
    .union([z.number().int().positive(), z.string().min(1)])
    .optional()
    .describe(
      'Human-visible story number (e.g. 42 or "#42"). Provide exactly one of storyId or storyNumber.',
    ),
};

function refineMcpStoryReference(
  data: { storyId?: string; storyNumber?: number | string },
  ctx: z.RefinementCtx,
) {
  const hasId = data.storyId !== undefined;
  const hasNum = data.storyNumber !== undefined;
  if (hasId === hasNum) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Specify exactly one of storyId or storyNumber.",
    });
  }
}

function parseMcpStoryNumber(value: number | string): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  return parseStoryNumberReference(value);
}

async function resolveMcpStoryId(
  repository: D1StoryRepository,
  projectId: string,
  storyId: string | undefined,
  storyNumber: number | string | undefined,
): Promise<{ ok: true; storyId: string } | { ok: false; message: string }> {
  const hasId = storyId !== undefined;
  const hasNum = storyNumber !== undefined;
  if (hasId && hasNum) {
    return {
      ok: false,
      message: "Specify exactly one of storyId or storyNumber.",
    };
  }
  if (!hasId && !hasNum) {
    return {
      ok: false,
      message: "Specify storyId or storyNumber.",
    };
  }
  if (hasId) {
    return { ok: true, storyId: storyId! };
  }
  const num = parseMcpStoryNumber(storyNumber as number | string);
  if (num === null) {
    return {
      ok: false,
      message:
        'Invalid storyNumber. Use a positive integer or a string such as "42" or "#42".',
    };
  }
  const found = await repository.findByStoryNumber(projectId, num);
  if (found.isErr()) {
    return {
      ok: false,
      message: `Failed to resolve story: ${found.error}`,
    };
  }
  if (!found.value) {
    return {
      ok: false,
      message: `Story not found for storyNumber ${num}.`,
    };
  }
  return { ok: true, storyId: found.value.id };
}

function createMcpServer({ db, currentUser }: McpRequestContext): McpServer {
  const server = new McpServer({
    name: "tatsumaki",
    version: "0.0.1",
  });

  server.registerTool(
    "get_project",
    {
      title: "Get Project",
      description:
        "Get a project's information from tatsumaki by its ID. Returns project name, settings (pointScaleType, sprintDurationDays, etc.), and the caller's role. Also verifies that the caller has access to this project.",
      inputSchema: z.object({
        projectId: z.string().min(1).describe("The project ID"),
      }),
    },
    async ({ projectId }) => {
      const projectRepository = new D1ProjectRepository(db);
      const access = await requireProjectAccess(
        projectRepository,
        projectId,
        currentUser.id,
      );

      if (!access.ok) {
        return access.response;
      }

      const result = await getProject(projectRepository, { projectId });

      if (result.isErr()) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch project: ${result.error}`,
            },
          ],
          isError: true,
        };
      }

      if (!result.value) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Project not found: ${projectId}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              project: {
                id: result.value.id,
                name: result.value.name,
                sprintDurationDays: result.value.sprintDurationDays,
                pointScaleType: result.value.pointScaleType,
                customPointScale: result.value.customPointScale,
                estimateBugs: result.value.estimateBugs,
                estimateChores: result.value.estimateChores,
                iterationStartDay: result.value.iterationStartDay,
                currentUserRole: access.member.role,
              },
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_stories",
    {
      title: "List Stories",
      description:
        "Fetch stories from a tatsumaki project. Returns stories in priority order. Supports filtering to the current iteration and limiting to the top N stories.",
      inputSchema: z.object({
        projectId: z.string().min(1).describe("The project ID"),
        status: z
          .enum(STORY_STATUSES)
          .optional()
          .describe("Filter by status. Omit to return all stories."),
        iterationScope: z
          .enum(["current"])
          .optional()
          .describe(
            "Filter stories to the current iteration only. Omit to return all stories.",
          ),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Maximum number of stories to return from the top of the priority-ordered list.",
          ),
      }),
    },
    async ({ projectId, status, iterationScope, limit }) => {
      const projectRepository = new D1ProjectRepository(db);
      const access = await requireProjectAccess(
        projectRepository,
        projectId,
        currentUser.id,
      );

      if (!access.ok) {
        return access.response;
      }

      const repository = new D1StoryRepository(db);
      const result = await listStories(repository, {
        projectId,
        ...(status !== undefined ? { status } : {}),
      });

      if (result.isErr()) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch stories: ${result.error}`,
            },
          ],
          isError: true,
        };
      }

      let stories = result.value;

      if (iterationScope === "current") {
        const iterationRepository = new D1IterationRepository(db);
        const iterationResult = await iterationRepository.list(projectId);

        if (iterationResult.isErr()) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to fetch current iteration: ${iterationResult.error}`,
              },
            ],
            isError: true,
          };
        }

        const today = todayIso();
        const currentIteration =
          iterationResult.value.find((iteration) => {
            return iteration.startDate <= today && iteration.endDate > today;
          }) ?? null;

        stories = currentIteration
          ? stories.filter((story) => story.iterationId === currentIteration.id)
          : [];
      }

      if (limit !== undefined) {
        stories = stories.slice(0, limit);
      }

      const serializedStories = stories.map((story) => ({
        id: story.id,
        storyNumber: story.storyNumber,
        title: story.title,
        description: story.description,
        status: story.status,
        isIcebox: story.isIcebox,
        storyPoint: story.storyPoint,
        type: story.type,
        labels: story.labels,
        iterationId: story.iterationId,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ stories: serializedStories }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_story",
    {
      title: "Get Story",
      description:
        "Get a single story from a tatsumaki project by story ID or human-visible story number. Returns id, storyNumber, title, description, status, storyPoint, type, and labels.",
      inputSchema: z
        .object({
          projectId: z.string().min(1).describe("The project ID"),
          ...mcpStoryReferenceSchemaFields,
        })
        .superRefine(refineMcpStoryReference),
    },
    async ({ projectId, storyId, storyNumber }) => {
      const projectRepository = new D1ProjectRepository(db);
      const access = await requireProjectAccess(
        projectRepository,
        projectId,
        currentUser.id,
      );

      if (!access.ok) {
        return access.response;
      }
      const repository = new D1StoryRepository(db);
      const resolved = await resolveMcpStoryId(
        repository,
        projectId,
        storyId,
        storyNumber,
      );
      if (!resolved.ok) {
        return {
          content: [{ type: "text" as const, text: resolved.message }],
          isError: true,
        };
      }

      const result = await getStory(repository, {
        projectId,
        storyId: resolved.storyId,
      });

      if (result.isErr()) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch story: ${result.error}`,
            },
          ],
          isError: true,
        };
      }

      if (!result.value) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Story not found: ${resolved.storyId}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              story: {
                id: result.value.id,
                storyNumber: result.value.storyNumber,
                title: result.value.title,
                description: result.value.description,
                status: result.value.status,
                isIcebox: result.value.isIcebox,
                storyPoint: result.value.storyPoint,
                type: result.value.type,
                labels: result.value.labels,
              },
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "reorder_stories",
    {
      title: "Reorder Stories",
      description:
        "Reorder stories in a tatsumaki project by supplying story IDs in the desired order.",
      inputSchema: z.object({
        projectId: z.string().min(1).describe("The project ID"),
        orderedIds: z
          .array(z.string().min(1))
          .min(1)
          .describe(
            "Story IDs in the desired order. Must be unique and belong to the same project.",
          ),
      }),
    },
    async ({ projectId, orderedIds }) => {
      const projectRepository = new D1ProjectRepository(db);
      const access = await requireProjectAccess(
        projectRepository,
        projectId,
        currentUser.id,
      );

      if (!access.ok) {
        return access.response;
      }

      const repository = new D1StoryRepository(db);
      const result = await reorderStories(repository, projectId, orderedIds);

      if (result.isErr()) {
        const response = toReorderStoriesErrorResponse(result.error);
        return {
          content: [
            {
              type: "text" as const,
              text: response.message,
            },
          ],
          isError: true,
        };
      }

      const serializedStories = result.value.map((story) => ({
        id: story.id,
        storyNumber: story.storyNumber,
        title: story.title,
        description: story.description,
        status: story.status,
        isIcebox: story.isIcebox,
        storyPoint: story.storyPoint,
        type: story.type,
        labels: story.labels,
        iterationId: story.iterationId,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ stories: serializedStories }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "create_story",
    {
      title: "Create Story",
      description:
        "Create a story in a tatsumaki project. Returns the created story id, storyNumber, title, status, storyPoint, and type.",
      inputSchema: z.object({
        projectId: z.string().min(1).describe("The project ID"),
        title: z.string().optional().describe("The story title. Required."),
        type: z
          .string()
          .optional()
          .describe(
            `The story type. Required. One of: ${STORY_TYPES.join(", ")}.`,
          ),
        description: z.string().describe("The story description."),
        isIcebox: z
          .boolean()
          .optional()
          .describe("Whether the story should start in Icebox."),
      }),
    },
    async ({ projectId, title, type, description, isIcebox }) => {
      const projectRepository = new D1ProjectRepository(db);
      const access = await requireProjectAccess(
        projectRepository,
        projectId,
        currentUser.id,
      );

      if (!access.ok) {
        return access.response;
      }

      const projectResult = await projectRepository.findById(projectId);
      if (projectResult.isErr() || !projectResult.value) {
        return {
          content: [{ type: "text" as const, text: "Project not found." }],
          isError: true,
        };
      }
      const allowedStoryPoints = getPointScale(
        projectResult.value.pointScaleType,
        projectResult.value.customPointScale,
      );

      const repository = new D1StoryRepository(db);
      const activityRepository = new D1StoryActivityRepository(db);
      const notificationRepository = new D1NotificationRepository(db);
      const result = await createStory(
        repository,
        activityRepository,
        {
          projectId,
          title: title ?? "",
          type: type ?? "",
          description,
          status: "Unstarted",
          isIcebox: isIcebox ?? false,
          storyPoint: null,
          allowedStoryPoints,
          labels: [],
          actorUserId: currentUser.id,
          actorName: currentUser.email ?? currentUser.id,
        },
        { notificationRepository },
      );

      if (result.isErr()) {
        const response = toCreateStoryErrorResponse(result.error);
        return {
          content: [
            {
              type: "text" as const,
              text: response.message,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              story: {
                id: result.value.id,
                storyNumber: result.value.storyNumber,
                title: result.value.title,
                status: result.value.status,
                isIcebox: result.value.isIcebox,
                storyPoint: result.value.storyPoint,
                type: result.value.type,
              },
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "update_story",
    {
      title: "Update Story",
      description:
        "Update a story's fields in a tatsumaki project. Supports partial updates — only specified fields are changed. Does not update status — use update_story_status for status changes. Identify the story by storyId or storyNumber. Returns the updated story.",
      inputSchema: z
        .object({
          projectId: z.string().min(1).describe("The project ID"),
          ...mcpStoryReferenceSchemaFields,
          title: z.string().optional().describe("The story title"),
          description: z.string().optional().describe("The story description"),
          type: z
            .enum(STORY_TYPES)
            .optional()
            .describe(`The story type. One of: ${STORY_TYPES.join(", ")}.`),
          storyPoint: z
            .number()
            .nullable()
            .optional()
            .describe("The story point estimate. Set to null to clear."),
          labels: z.array(z.string()).optional().describe("The story labels"),
          isIcebox: z
            .boolean()
            .optional()
            .describe("Whether the story should be in Icebox."),
        })
        .superRefine(refineMcpStoryReference),
    },
    async ({
      projectId,
      storyId,
      storyNumber,
      title,
      description,
      type,
      storyPoint,
      labels,
      isIcebox,
    }) => {
      const projectRepository = new D1ProjectRepository(db);
      const access = await requireProjectAccess(
        projectRepository,
        projectId,
        currentUser.id,
      );

      if (!access.ok) {
        return access.response;
      }

      const projectResult = await projectRepository.findById(projectId);
      if (projectResult.isErr() || !projectResult.value) {
        return {
          content: [{ type: "text" as const, text: "Project not found." }],
          isError: true,
        };
      }
      const allowedStoryPoints = getPointScale(
        projectResult.value.pointScaleType,
        projectResult.value.customPointScale,
      );

      const repository = new D1StoryRepository(db);
      const resolved = await resolveMcpStoryId(
        repository,
        projectId,
        storyId,
        storyNumber,
      );
      if (!resolved.ok) {
        return {
          content: [{ type: "text" as const, text: resolved.message }],
          isError: true,
        };
      }

      const activityRepository = new D1StoryActivityRepository(db);
      const notificationRepository = new D1NotificationRepository(db);
      const result = await updateStory(
        repository,
        activityRepository,
        {
          projectId,
          id: resolved.storyId,
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(type !== undefined ? { type } : {}),
          ...(storyPoint !== undefined ? { storyPoint } : {}),
          allowedStoryPoints,
          ...(labels !== undefined ? { labels } : {}),
          ...(isIcebox !== undefined ? { isIcebox } : {}),
          actor: {
            id: currentUser.id,
            name: currentUser.email ?? currentUser.id,
          },
        },
        { notificationRepository },
      );

      if (result.isErr()) {
        const response = toUpdateStoryErrorResponse(result.error);
        return {
          content: [
            {
              type: "text" as const,
              text: response.message,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              story: {
                id: result.value.id,
                storyNumber: result.value.storyNumber,
                title: result.value.title,
                description: result.value.description,
                status: result.value.status,
                isIcebox: result.value.isIcebox,
                storyPoint: result.value.storyPoint,
                type: result.value.type,
                labels: result.value.labels,
              },
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "update_story_status",
    {
      title: "Update Story Status",
      description:
        "Update a story status in a tatsumaki project. Identify the story by storyId or storyNumber. Returns the updated story id, storyNumber, title, status, storyPoint, and type.",
      inputSchema: z
        .object({
          projectId: z.string().min(1).describe("The project ID"),
          ...mcpStoryReferenceSchemaFields,
          status: z
            .enum(STORY_STATUSES)
            .describe(
              `The target story status. One of: ${STORY_STATUSES.join(", ")}.`,
            ),
        })
        .superRefine(refineMcpStoryReference),
    },
    async ({ projectId, storyId, storyNumber, status }) => {
      const projectRepository = new D1ProjectRepository(db);
      const access = await requireProjectAccess(
        projectRepository,
        projectId,
        currentUser.id,
      );

      if (!access.ok) {
        return access.response;
      }

      const repository = new D1StoryRepository(db);
      const resolved = await resolveMcpStoryId(
        repository,
        projectId,
        storyId,
        storyNumber,
      );
      if (!resolved.ok) {
        return {
          content: [{ type: "text" as const, text: resolved.message }],
          isError: true,
        };
      }

      const activityRepository = new D1StoryActivityRepository(db);
      const notificationRepository = new D1NotificationRepository(db);
      const result = await updateStory(
        repository,
        activityRepository,
        {
          projectId,
          id: resolved.storyId,
          status,
          actor: {
            id: currentUser.id,
            name: currentUser.email ?? currentUser.id,
          },
        },
        { notificationRepository },
      );

      if (result.isErr()) {
        const response = toUpdateStoryErrorResponse(result.error);
        return {
          content: [
            {
              type: "text" as const,
              text: response.message,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              story: {
                id: result.value.id,
                storyNumber: result.value.storyNumber,
                title: result.value.title,
                status: result.value.status,
                isIcebox: result.value.isIcebox,
                storyPoint: result.value.storyPoint,
                type: result.value.type,
              },
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "create_story_comment",
    {
      title: "Create Story Comment",
      description:
        "Add a comment to a story in a tatsumaki project. Identify the story by storyId or storyNumber. Returns the created comment id and body.",
      inputSchema: z
        .object({
          projectId: z.string().min(1).describe("The project ID"),
          ...mcpStoryReferenceSchemaFields,
          body: z.string().min(1).describe("The comment body"),
        })
        .superRefine(refineMcpStoryReference),
    },
    async ({ projectId, storyId, storyNumber, body }) => {
      const projectRepository = new D1ProjectRepository(db);
      const access = await requireProjectAccess(
        projectRepository,
        projectId,
        currentUser.id,
      );

      if (!access.ok) {
        return access.response;
      }

      const storyRepository = new D1StoryRepository(db);
      const resolved = await resolveMcpStoryId(
        storyRepository,
        projectId,
        storyId,
        storyNumber,
      );
      if (!resolved.ok) {
        return {
          content: [{ type: "text" as const, text: resolved.message }],
          isError: true,
        };
      }

      const repository = new D1StoryCommentRepository(db);
      const result = await createStoryComment(repository, {
        projectId,
        storyId: resolved.storyId,
        userId: currentUser.id,
        actorName: currentUser.email ?? currentUser.id,
        body,
      });

      if (result.isErr()) {
        const message =
          result.error === STORY_COMMENT_NOT_FOUND_ERROR
            ? `Story not found: ${resolved.storyId}`
            : `Failed to create comment: ${result.error}`;
        return {
          content: [
            {
              type: "text" as const,
              text: message,
            },
          ],
          isError: true,
        };
      }

      const storyResult = await getStory(storyRepository, {
        projectId,
        storyId: resolved.storyId,
      });
      if (storyResult.isOk() && storyResult.value) {
        const notificationRepository = new D1NotificationRepository(db);
        const notifyResult = await createAssigneeCommentNotifications(
          notificationRepository,
          {
            projectId,
            storyId: resolved.storyId,
            storyTitle: storyResult.value.title,
            ownerIds: storyResult.value.ownerIds,
            actorUserId: currentUser.id,
            actorName: currentUser.email ?? currentUser.id,
            commentId: result.value.id,
            commentBody: result.value.body,
            createdAt: result.value.createdAt,
          },
        );
        if (notifyResult.isErr()) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Failed to create comment notifications",
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              comment: {
                id: result.value.id,
                body: result.value.body,
              },
            }),
          },
        ],
      };
    },
  );

  return server;
}

export async function handleMcpRequest(
  request: Request,
  env: Env["Bindings"],
  currentUser: CurrentUser,
): Promise<Response> {
  const server = createMcpServer({ db: env.DB, currentUser });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  const body = await request
    .clone()
    .json()
    .catch(() => undefined);
  return transport.handleRequest(request, { parsedBody: body });
}

export const mcpRoute = new Hono<Env>();

mcpRoute.all("/mcp", async (c) => {
  return handleMcpRequest(c.req.raw, c.env, c.get("currentUser"));
});
