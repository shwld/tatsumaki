import { err, ok, type Result } from "neverthrow";
import {
  type EpicOutcomeStatus,
  isEpicOutcomeStatus,
} from "../../domain/entities/epic";

export const INVALID_EPIC_DESCRIPTION_ERROR =
  "INVALID_EPIC_DESCRIPTION_ERROR" as const;
export const INVALID_EPIC_PLANNED_PERIOD_ERROR =
  "INVALID_EPIC_PLANNED_PERIOD_ERROR" as const;
export const INVALID_EPIC_OUTCOME_STATUS_ERROR =
  "INVALID_EPIC_OUTCOME_STATUS_ERROR" as const;

export const EPIC_TEXT_MAX_LENGTH = 10000;

export type EpicPlannedPeriod = { start: string; end: string };

export function normalizeEpicDescription(
  description: string,
): Result<string, typeof INVALID_EPIC_DESCRIPTION_ERROR> {
  const normalized = description.trim();
  if (normalized.length > EPIC_TEXT_MAX_LENGTH) {
    return err(INVALID_EPIC_DESCRIPTION_ERROR);
  }
  return ok(normalized);
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Dates are plain calendar days; they are compared as written and never converted between time zones. */
export function normalizeEpicPlannedPeriod(
  period: EpicPlannedPeriod | null,
): Result<EpicPlannedPeriod | null, typeof INVALID_EPIC_PLANNED_PERIOD_ERROR> {
  if (period === null) {
    return ok(null);
  }
  const start = period.start.trim();
  const end = period.end.trim();
  if (!isCalendarDate(start) || !isCalendarDate(end) || start > end) {
    return err(INVALID_EPIC_PLANNED_PERIOD_ERROR);
  }
  return ok({ start, end });
}

export function normalizeEpicOutcomeStatus(
  value: string,
): Result<EpicOutcomeStatus, typeof INVALID_EPIC_OUTCOME_STATUS_ERROR> {
  return isEpicOutcomeStatus(value)
    ? ok(value)
    : err(INVALID_EPIC_OUTCOME_STATUS_ERROR);
}
