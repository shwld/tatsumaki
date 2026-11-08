import type { McpServer } from "@modelcontextprotocol/server";
import type { Result } from "neverthrow";
import { z } from "zod";
import { listProjectLabels } from "../../../application/usecases/manage-project-labels";
import {
  disableEpicPlanning,
  type EpicDependencies,
  enableEpicPlanning,
  getEpic,
  getEpicProgress,
  getLabelDeletionImpact,
  listEpicProgress,
  listEpics,
  type ManageEpicError,
  updateEpicPlan,
} from "../../../application/usecases/manage-epics";
import type { Epic } from "../../../domain/entities/epic";
import { EPIC_OUTCOME_STATUSES } from "../../../domain/entities/epic";
import type { ProjectMember } from "../../../domain/entities/project-member";
import { D1EpicRepository } from "../../../infrastructure/db/repositories/d1-epic-repository";
import { D1ProjectLabelRepository } from "../../../infrastructure/db/repositories/d1-project-label-repository";
import { D1ProjectRepository } from "../../../infrastructure/db/repositories/d1-project-repository";
import type { CurrentUser } from "../../middleware/access-auth";
import { parseEpicPlanBody } from "../epics/request-parsers";
import {
  currentCalendarDateUtc,
  toEpicErrorResponse,
  toEpicProgressResponse,
  toEpicResponse,
} from "../epics/responses";
import { requireProjectAccess } from "./project-access";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const projectIdField = z.string().min(1).describe("The project ID");
const labelIdField = z
  .string()
  .min(1)
  .describe("The label ID (see list_labels)");
const revisionField = z
  .number()
  .int()
  .positive()
  .describe("The epic revision you last read; a newer one is a conflict");

function text(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function failure(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function epicFailure(error: ManageEpicError): ToolResult {
  const { code, message } = toEpicErrorResponse(error);
  return failure(`${code}: ${message}`);
}

function epicResult(result: Result<Epic, ManageEpicError>): ToolResult {
  return result.isErr()
    ? epicFailure(result.error)
    : text({ epic: toEpicResponse(result.value) });
}

/** Strategy planning of labels (ADR-0013). */
export function registerEpicTools(
  server: McpServer,
  { db, currentUser }: { db: D1Database; currentUser: CurrentUser },
) {
  const projectRepository = new D1ProjectRepository(db);
  const deps: EpicDependencies = {
    epicRepository: new D1EpicRepository(db),
    labelRepository: new D1ProjectLabelRepository(db),
    projectRepository,
  };

  async function withMember(
    projectId: string,
    run: (member: ProjectMember) => Promise<ToolResult>,
  ): Promise<ToolResult> {
    const access = await requireProjectAccess(
      projectRepository,
      projectId,
      currentUser.id,
    );
    if (!access.ok) return access.response;
    return run(access.member);
  }

  server.registerTool(
    "list_labels",
    {
      title: "List Labels",
      description:
        "List the labels of a project with their IDs, names and colors.",
      inputSchema: z.object({ projectId: projectIdField }),
    },
    ({ projectId }) =>
      withMember(projectId, async () => {
        const result = await listProjectLabels(deps.labelRepository, projectId);
        if (result.isErr()) return failure("Failed to load labels");
        return text({
          labels: result.value.map(({ id, name, color }) => ({
            id,
            name,
            color,
          })),
        });
      }),
  );

  server.registerTool(
    "list_epics",
    {
      title: "List Epics",
      description:
        "List the epics of a project. An epic is the strategy plan of one label; `enabled` tells whether planning is on.",
      inputSchema: z.object({ projectId: projectIdField }),
    },
    ({ projectId }) =>
      withMember(projectId, async () => {
        const result = await listEpics(deps, projectId);
        if (result.isErr()) return epicFailure(result.error);
        return text({ epics: result.value.map(toEpicResponse) });
      }),
  );

  server.registerTool(
    "list_epic_progress",
    {
      title: "List Epic Progress",
      description:
        "List the epics with planning on, each with progress derived from its stories: completion rate (accepted ÷ all stories with the label, Icebox included), counts by status, blocked count, supplementary point rate, state and overdue. `total` counts a story shared by several epics once.",
      inputSchema: z.object({ projectId: projectIdField }),
    },
    ({ projectId }) =>
      withMember(projectId, async () => {
        const result = await listEpicProgress(deps, {
          projectId,
          today: currentCalendarDateUtc(),
        });
        if (result.isErr()) return epicFailure(result.error);
        return text({
          epics: result.value.epics.map(toEpicProgressResponse),
          total: result.value.total,
        });
      }),
  );

  server.registerTool(
    "get_label_epic_progress",
    {
      title: "Get Label Epic Progress",
      description:
        "Get one epic with planning on: its plan, progress breakdown, and the stories carrying its label.",
      inputSchema: z.object({
        projectId: projectIdField,
        labelId: labelIdField,
      }),
    },
    ({ projectId, labelId }) =>
      withMember(projectId, async () => {
        const result = await getEpicProgress(deps, {
          projectId,
          labelId,
          today: currentCalendarDateUtc(),
        });
        if (result.isErr()) return epicFailure(result.error);
        return text({
          ...toEpicProgressResponse(result.value),
          stories: result.value.stories,
        });
      }),
  );

  server.registerTool(
    "get_label_epic",
    {
      title: "Get Label Epic",
      description:
        "Get the strategy plan of a label: purpose, success criteria, owner, planned period, outcome status and revision.",
      inputSchema: z.object({
        projectId: projectIdField,
        labelId: labelIdField,
      }),
    },
    ({ projectId, labelId }) =>
      withMember(projectId, async () =>
        epicResult(await getEpic(deps, { projectId, labelId })),
      ),
  );

  server.registerTool(
    "enable_label_epic",
    {
      title: "Turn On Label Strategy Planning",
      description:
        "Turn strategy planning on for a label. The first time creates its epic; when the label already has a saved plan, pass its revision to restore it.",
      inputSchema: z.object({
        projectId: projectIdField,
        labelId: labelIdField,
        revision: revisionField.optional(),
      }),
    },
    ({ projectId, labelId, revision }) =>
      withMember(projectId, async (member) =>
        epicResult(
          await enableEpicPlanning(deps, {
            projectId,
            labelId,
            actorRole: member.role,
            ...(revision !== undefined ? { revision } : {}),
          }),
        ),
      ),
  );

  server.registerTool(
    "disable_label_epic",
    {
      title: "Turn Off Label Strategy Planning",
      description:
        "Turn strategy planning off for a label. The plan is kept and comes back when planning is turned on again; the label stays on its stories.",
      inputSchema: z.object({
        projectId: projectIdField,
        labelId: labelIdField,
        revision: revisionField,
      }),
    },
    ({ projectId, labelId, revision }) =>
      withMember(projectId, async (member) =>
        epicResult(
          await disableEpicPlanning(deps, {
            projectId,
            labelId,
            actorRole: member.role,
            revision,
          }),
        ),
      ),
  );

  server.registerTool(
    "update_label_epic_plan",
    {
      title: "Update Label Epic Plan",
      description:
        "Save the strategy plan of a label. Only the given fields change. plannedStart and plannedEnd go together as YYYY-MM-DD (or both null to clear). outcomeStatus is entered by a person and never inferred from story completion.",
      inputSchema: z.object({
        projectId: projectIdField,
        labelId: labelIdField,
        revision: revisionField,
        description: z.string().optional().describe("Purpose of the epic"),
        successCriteria: z.string().optional(),
        ownerId: z
          .string()
          .nullable()
          .optional()
          .describe("User ID of a project member, or null"),
        plannedStart: z.string().nullable().optional(),
        plannedEnd: z.string().nullable().optional(),
        outcomeStatus: z.enum(EPIC_OUTCOME_STATUSES).optional(),
      }),
    },
    ({ projectId, labelId, ...body }) =>
      withMember(projectId, async (member) => {
        const parsed = parseEpicPlanBody(body);
        if (!parsed.ok) return failure(parsed.message);
        return epicResult(
          await updateEpicPlan(deps, {
            projectId,
            labelId,
            actorRole: member.role,
            ...parsed.value,
          }),
        );
      }),
  );

  server.registerTool(
    "get_label_deletion_impact",
    {
      title: "Get Label Deletion Impact",
      description:
        "Before deleting a label, show what goes with it: how many stories lose the label, and its epic with the plan. Turning planning off keeps the plan instead.",
      inputSchema: z.object({
        projectId: projectIdField,
        labelId: labelIdField,
      }),
    },
    ({ projectId, labelId }) =>
      withMember(projectId, async () => {
        const result = await getLabelDeletionImpact(deps, {
          projectId,
          labelId,
        });
        if (result.isErr()) return epicFailure(result.error);
        const { label, storyCount, epic } = result.value;
        return text({
          labelId: label.id,
          labelName: label.name,
          storyCount,
          epic,
        });
      }),
  );
}
