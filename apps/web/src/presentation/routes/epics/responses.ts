import {
  INVALID_EPIC_DESCRIPTION_ERROR,
  INVALID_EPIC_OUTCOME_STATUS_ERROR,
  INVALID_EPIC_PLANNED_PERIOD_ERROR,
  EPIC_TEXT_MAX_LENGTH,
} from "../../../application/usecases/epic-input";
import {
  EPIC_FORBIDDEN_ERROR,
  EPIC_LABEL_NOT_FOUND_ERROR,
  EPIC_NOT_FOUND_ERROR,
  EPIC_PLANNING_OFF_ERROR,
  EPIC_REVISION_CONFLICT_ERROR,
  EPIC_REVISION_REQUIRED_ERROR,
  INVALID_EPIC_OWNER_ERROR,
  type ManageEpicError,
} from "../../../application/usecases/manage-epics";
import type { Epic } from "../../../domain/entities/epic";
import type { EpicWithProgress } from "../../../domain/entities/epic-progress";

export type EpicErrorResponse = {
  status: 400 | 403 | 404 | 409 | 500;
  code: string;
  message: string;
};

export function toEpicErrorResponse(error: ManageEpicError): EpicErrorResponse {
  switch (error) {
    case EPIC_FORBIDDEN_ERROR:
      return {
        status: 403,
        code: "FORBIDDEN",
        message: "Viewers cannot change strategy planning",
      };
    case EPIC_LABEL_NOT_FOUND_ERROR:
      return {
        status: 404,
        code: "LABEL_NOT_FOUND",
        message: "Label not found in this project",
      };
    case EPIC_NOT_FOUND_ERROR:
      return {
        status: 404,
        code: "EPIC_NOT_FOUND",
        message: "Strategy planning has never been turned on for this label",
      };
    case EPIC_PLANNING_OFF_ERROR:
      return {
        status: 404,
        code: "EPIC_PLANNING_OFF",
        message:
          "Strategy planning is off for this label. Turn it on to see progress",
      };
    case EPIC_REVISION_REQUIRED_ERROR:
      return {
        status: 409,
        code: "REVISION_REQUIRED",
        message:
          "This label has a saved plan. Pass the revision you last read to turn planning on again",
      };
    case EPIC_REVISION_CONFLICT_ERROR:
      return {
        status: 409,
        code: "REVISION_CONFLICT",
        message:
          "The plan was changed by someone else. Read it again and retry with the new revision",
      };
    case INVALID_EPIC_OWNER_ERROR:
      return {
        status: 400,
        code: "INVALID_OWNER",
        message: "ownerIds must all be members of this project",
      };
    case INVALID_EPIC_DESCRIPTION_ERROR:
      return {
        status: 400,
        code: "INVALID_DESCRIPTION",
        message: `description must be at most ${EPIC_TEXT_MAX_LENGTH} characters`,
      };
    case INVALID_EPIC_PLANNED_PERIOD_ERROR:
      return {
        status: 400,
        code: "INVALID_PLANNED_PERIOD",
        message:
          "plannedStart and plannedEnd must be calendar dates (YYYY-MM-DD) with plannedStart on or before plannedEnd",
      };
    case INVALID_EPIC_OUTCOME_STATUS_ERROR:
      return {
        status: 400,
        code: "INVALID_OUTCOME_STATUS",
        message: "outcomeStatus must be one of unevaluated, achieved, missed",
      };
    default:
      return {
        status: 500,
        code: "INTERNAL_ERROR",
        message: "Failed to process strategy planning",
      };
  }
}

export function toEpicResponse(epic: Epic) {
  const { __typename: _typename, ...rest } = epic;
  return rest;
}

export function toEpicProgressResponse({ epic, progress }: EpicWithProgress) {
  return { epic: toEpicResponse(epic), progress };
}

export function currentCalendarDateUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
