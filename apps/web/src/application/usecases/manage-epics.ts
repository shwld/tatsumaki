import { err, ok, type Result } from "neverthrow";
import { type Epic, hasEpicPlan } from "../../domain/entities/epic";
import {
  deriveEpicProgress,
  type EpicProgress,
  type EpicStory,
  type EpicStoryAggregate,
  type EpicWithProgress,
  type StoryCounts,
  toStoryCounts,
} from "../../domain/entities/epic-progress";
import type { ProjectLabel } from "../../domain/entities/project-label";
import type { ProjectMemberRole } from "../../domain/entities/project-member";
import type {
  EpicPlanPatch,
  EpicRepository,
  EpicRepositoryError,
} from "../../domain/repositories/epic-repository";
import type {
  ProjectLabelRepository,
  ProjectLabelRepositoryError,
} from "../../domain/repositories/project-label-repository";
import type {
  ProjectRepository,
  ProjectRepositoryError,
} from "../../domain/repositories/project-repository";
import {
  type EpicPlannedPeriod,
  INVALID_EPIC_DESCRIPTION_ERROR,
  INVALID_EPIC_OUTCOME_STATUS_ERROR,
  INVALID_EPIC_PLANNED_PERIOD_ERROR,
  normalizeEpicDescription,
  normalizeEpicOutcomeStatus,
  normalizeEpicPlannedPeriod,
} from "./epic-input";

export const EPIC_FORBIDDEN_ERROR = "EPIC_FORBIDDEN_ERROR" as const;
export const EPIC_LABEL_NOT_FOUND_ERROR = "EPIC_LABEL_NOT_FOUND_ERROR" as const;
export const EPIC_NOT_FOUND_ERROR = "EPIC_NOT_FOUND_ERROR" as const;
export const EPIC_PLANNING_OFF_ERROR = "EPIC_PLANNING_OFF_ERROR" as const;
export const EPIC_REVISION_REQUIRED_ERROR =
  "EPIC_REVISION_REQUIRED_ERROR" as const;
export const EPIC_REVISION_CONFLICT_ERROR =
  "EPIC_REVISION_CONFLICT_ERROR" as const;
export const INVALID_EPIC_OWNER_ERROR = "INVALID_EPIC_OWNER_ERROR" as const;

export type ManageEpicError =
  | EpicRepositoryError
  | ProjectLabelRepositoryError
  | ProjectRepositoryError
  | typeof EPIC_FORBIDDEN_ERROR
  | typeof EPIC_LABEL_NOT_FOUND_ERROR
  | typeof EPIC_NOT_FOUND_ERROR
  | typeof EPIC_PLANNING_OFF_ERROR
  | typeof EPIC_REVISION_REQUIRED_ERROR
  | typeof EPIC_REVISION_CONFLICT_ERROR
  | typeof INVALID_EPIC_OWNER_ERROR
  | typeof INVALID_EPIC_DESCRIPTION_ERROR
  | typeof INVALID_EPIC_PLANNED_PERIOD_ERROR
  | typeof INVALID_EPIC_OUTCOME_STATUS_ERROR;

export type EpicDependencies = {
  epicRepository: EpicRepository;
  labelRepository: ProjectLabelRepository;
  projectRepository: ProjectRepository;
};

type EpicTarget = {
  projectId: string;
  labelId: string;
};

type EpicCommand = EpicTarget & {
  actorRole: ProjectMemberRole;
};

function canEdit(role: ProjectMemberRole): boolean {
  return role !== "viewer";
}

async function requireLabel(
  labelRepository: ProjectLabelRepository,
  target: EpicTarget,
): Promise<Result<ProjectLabel, ManageEpicError>> {
  const label = await labelRepository.findById(
    target.projectId,
    target.labelId,
  );
  if (label.isErr()) {
    return err(label.error);
  }
  if (!label.value) {
    return err(EPIC_LABEL_NOT_FOUND_ERROR);
  }
  return ok(label.value);
}

/** A null write result means the revision moved or the epic does not exist; this tells them apart. */
async function explainMissedWrite(
  epicRepository: EpicRepository,
  target: EpicTarget,
): Promise<Result<never, ManageEpicError>> {
  const current = await epicRepository.findByLabelId(
    target.projectId,
    target.labelId,
  );
  if (current.isErr()) {
    return err(current.error);
  }
  return err(
    current.value ? EPIC_REVISION_CONFLICT_ERROR : EPIC_NOT_FOUND_ERROR,
  );
}

export async function listEpics(
  deps: Pick<EpicDependencies, "epicRepository">,
  projectId: string,
): Promise<Result<Epic[], ManageEpicError>> {
  return deps.epicRepository.list(projectId);
}

export async function getEpic(
  deps: Pick<EpicDependencies, "epicRepository" | "labelRepository">,
  target: EpicTarget,
): Promise<Result<Epic, ManageEpicError>> {
  const label = await requireLabel(deps.labelRepository, target);
  if (label.isErr()) {
    return err(label.error);
  }
  const epic = await deps.epicRepository.findByLabelId(
    target.projectId,
    target.labelId,
  );
  if (epic.isErr()) {
    return err(epic.error);
  }
  return epic.value ? ok(epic.value) : err(EPIC_NOT_FOUND_ERROR);
}

const emptyAggregate: EpicStoryAggregate = {
  total: 0,
  accepted: 0,
  inProgress: 0,
  unstarted: 0,
  icebox: 0,
  blocked: 0,
  estimatedPoints: 0,
  acceptedPoints: 0,
  excludedStories: 0,
};

export type EpicProgressList = {
  epics: EpicWithProgress[];
  /** Shared stories counted once across the listed epics. */
  total: StoryCounts;
};

/** Epics with planning on, in plan order; each carries its progress, derived on read. */
export async function listEpicProgress(
  deps: Pick<EpicDependencies, "epicRepository">,
  input: { projectId: string; today: string },
): Promise<Result<EpicProgressList, ManageEpicError>> {
  const epics = await deps.epicRepository.list(input.projectId);
  if (epics.isErr()) {
    return err(epics.error);
  }
  const aggregates = await deps.epicRepository.aggregateStories(
    input.projectId,
  );
  if (aggregates.isErr()) {
    return err(aggregates.error);
  }
  const { byEpicId, total } = aggregates.value;

  return ok({
    epics: epics.value
      .filter((epic) => epic.enabled)
      .map((epic) => ({
        epic,
        progress: deriveEpicProgress(
          epic,
          byEpicId.get(epic.id) ?? emptyAggregate,
          input.today,
        ),
      })),
    total: toStoryCounts(total),
  });
}

export type EpicProgressDetail = {
  epic: Epic;
  progress: EpicProgress;
  stories: EpicStory[];
};

export async function getEpicProgress(
  deps: Pick<EpicDependencies, "epicRepository" | "labelRepository">,
  input: EpicTarget & { today: string },
): Promise<Result<EpicProgressDetail, ManageEpicError>> {
  const epic = await getEpic(deps, input);
  if (epic.isErr()) {
    return err(epic.error);
  }
  if (!epic.value.enabled) {
    return err(EPIC_PLANNING_OFF_ERROR);
  }
  const aggregates = await deps.epicRepository.aggregateStories(
    input.projectId,
    input.labelId,
  );
  if (aggregates.isErr()) {
    return err(aggregates.error);
  }
  const stories = await deps.epicRepository.listLabelStories(
    input.projectId,
    input.labelId,
  );
  if (stories.isErr()) {
    return err(stories.error);
  }
  return ok({
    epic: epic.value,
    progress: deriveEpicProgress(
      epic.value,
      aggregates.value.byEpicId.get(epic.value.id) ?? emptyAggregate,
      input.today,
    ),
    stories: stories.value,
  });
}

/**
 * Turns planning on. The first time creates the epic; afterwards it restores
 * the saved plan, which needs the revision the caller last saw.
 */
export async function enableEpicPlanning(
  deps: Pick<EpicDependencies, "epicRepository" | "labelRepository">,
  input: EpicCommand & { revision?: number },
): Promise<Result<Epic, ManageEpicError>> {
  if (!canEdit(input.actorRole)) {
    return err(EPIC_FORBIDDEN_ERROR);
  }
  const label = await requireLabel(deps.labelRepository, input);
  if (label.isErr()) {
    return err(label.error);
  }

  const created = await deps.epicRepository.createEnabled(
    input.projectId,
    input.labelId,
  );
  if (created.isErr()) {
    return err(created.error);
  }
  if (created.value) {
    return ok(created.value);
  }

  const existing = await deps.epicRepository.findByLabelId(
    input.projectId,
    input.labelId,
  );
  if (existing.isErr()) {
    return err(existing.error);
  }
  if (!existing.value) {
    return err(EPIC_LABEL_NOT_FOUND_ERROR);
  }
  if (existing.value.enabled) {
    if (
      input.revision !== undefined &&
      input.revision !== existing.value.revision
    ) {
      return err(EPIC_REVISION_CONFLICT_ERROR);
    }
    return ok(existing.value);
  }
  if (input.revision === undefined) {
    return err(EPIC_REVISION_REQUIRED_ERROR);
  }

  const enabled = await deps.epicRepository.setEnabled(
    input.projectId,
    input.labelId,
    true,
    input.revision,
  );
  if (enabled.isErr()) {
    return err(enabled.error);
  }
  return enabled.value
    ? ok(enabled.value)
    : explainMissedWrite(deps.epicRepository, input);
}

/** Turns planning off and keeps the plan, so turning it on again restores it. */
export async function disableEpicPlanning(
  deps: Pick<EpicDependencies, "epicRepository" | "labelRepository">,
  input: EpicCommand & { revision: number },
): Promise<Result<Epic, ManageEpicError>> {
  if (!canEdit(input.actorRole)) {
    return err(EPIC_FORBIDDEN_ERROR);
  }
  const label = await requireLabel(deps.labelRepository, input);
  if (label.isErr()) {
    return err(label.error);
  }
  const disabled = await deps.epicRepository.setEnabled(
    input.projectId,
    input.labelId,
    false,
    input.revision,
  );
  if (disabled.isErr()) {
    return err(disabled.error);
  }
  return disabled.value
    ? ok(disabled.value)
    : explainMissedWrite(deps.epicRepository, input);
}

export type UpdateEpicPlanInput = EpicCommand & {
  revision: number;
  description?: string;
  ownerIds?: string[];
  plannedPeriod?: EpicPlannedPeriod | null;
  outcomeStatus?: string;
};

export async function updateEpicPlan(
  deps: EpicDependencies,
  input: UpdateEpicPlanInput,
): Promise<Result<Epic, ManageEpicError>> {
  if (!canEdit(input.actorRole)) {
    return err(EPIC_FORBIDDEN_ERROR);
  }

  const patch: EpicPlanPatch = {};
  if (input.description !== undefined) {
    const description = normalizeEpicDescription(input.description);
    if (description.isErr()) return err(description.error);
    patch.description = description.value;
  }
  if (input.plannedPeriod !== undefined) {
    const period = normalizeEpicPlannedPeriod(input.plannedPeriod);
    if (period.isErr()) return err(period.error);
    patch.plannedStart = period.value?.start ?? null;
    patch.plannedEnd = period.value?.end ?? null;
  }
  if (input.outcomeStatus !== undefined) {
    const outcomeStatus = normalizeEpicOutcomeStatus(input.outcomeStatus);
    if (outcomeStatus.isErr()) return err(outcomeStatus.error);
    patch.outcomeStatus = outcomeStatus.value;
  }

  const label = await requireLabel(deps.labelRepository, input);
  if (label.isErr()) {
    return err(label.error);
  }

  if (input.ownerIds !== undefined) {
    const ownerIds = [...new Set(input.ownerIds)];
    for (const ownerId of ownerIds) {
      const member = await deps.projectRepository.findMember(
        input.projectId,
        ownerId,
      );
      if (member.isErr()) return err(member.error);
      if (!member.value) return err(INVALID_EPIC_OWNER_ERROR);
    }
    patch.ownerIds = ownerIds;
  }

  const updated = await deps.epicRepository.updatePlan(
    input.projectId,
    input.labelId,
    input.revision,
    patch,
  );
  if (updated.isErr()) {
    return err(updated.error);
  }
  return updated.value
    ? ok(updated.value)
    : explainMissedWrite(deps.epicRepository, input);
}

export type LabelDeletionImpact = {
  label: ProjectLabel;
  storyCount: number;
  epic: { id: string; enabled: boolean; hasPlan: boolean } | null;
};

/** What deleting a label also removes: its story memberships and its epic with the plan (ADR-0013). */
export async function getLabelDeletionImpact(
  deps: Pick<EpicDependencies, "epicRepository" | "labelRepository">,
  target: EpicTarget,
): Promise<Result<LabelDeletionImpact, ManageEpicError>> {
  const label = await requireLabel(deps.labelRepository, target);
  if (label.isErr()) {
    return err(label.error);
  }
  const storyCount = await deps.labelRepository.countStories(
    target.projectId,
    target.labelId,
  );
  if (storyCount.isErr()) {
    return err(storyCount.error);
  }
  const epic = await deps.epicRepository.findByLabelId(
    target.projectId,
    target.labelId,
  );
  if (epic.isErr()) {
    return err(epic.error);
  }
  return ok({
    label: label.value,
    storyCount: storyCount.value,
    epic: epic.value
      ? {
          id: epic.value.id,
          enabled: epic.value.enabled,
          hasPlan: hasEpicPlan(epic.value),
        }
      : null,
  });
}
