import { err, ok, type Result } from "neverthrow";
import { type Epic, hasEpicPlan } from "../../domain/entities/epic";
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
  INVALID_EPIC_SUCCESS_CRITERIA_ERROR,
  normalizeEpicDescription,
  normalizeEpicOutcomeStatus,
  normalizeEpicPlannedPeriod,
  normalizeEpicSuccessCriteria,
} from "./epic-input";

export const EPIC_FORBIDDEN_ERROR = "EPIC_FORBIDDEN_ERROR" as const;
export const EPIC_LABEL_NOT_FOUND_ERROR = "EPIC_LABEL_NOT_FOUND_ERROR" as const;
export const EPIC_NOT_FOUND_ERROR = "EPIC_NOT_FOUND_ERROR" as const;
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
  | typeof EPIC_REVISION_REQUIRED_ERROR
  | typeof EPIC_REVISION_CONFLICT_ERROR
  | typeof INVALID_EPIC_OWNER_ERROR
  | typeof INVALID_EPIC_DESCRIPTION_ERROR
  | typeof INVALID_EPIC_SUCCESS_CRITERIA_ERROR
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
  successCriteria?: string;
  ownerId?: string | null;
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
  if (input.successCriteria !== undefined) {
    const successCriteria = normalizeEpicSuccessCriteria(input.successCriteria);
    if (successCriteria.isErr()) return err(successCriteria.error);
    patch.successCriteria = successCriteria.value;
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

  if (input.ownerId !== undefined) {
    if (input.ownerId !== null) {
      const member = await deps.projectRepository.findMember(
        input.projectId,
        input.ownerId,
      );
      if (member.isErr()) return err(member.error);
      if (!member.value) return err(INVALID_EPIC_OWNER_ERROR);
    }
    patch.ownerId = input.ownerId;
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
