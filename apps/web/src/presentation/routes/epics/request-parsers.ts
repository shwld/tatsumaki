import type { EpicPlannedPeriod } from "../../../application/usecases/epic-input";

type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

export type EpicPlanRequest = {
  revision: number;
  description?: string;
  ownerIds?: string[];
  plannedPeriod?: EpicPlannedPeriod | null;
  outcomeStatus?: string;
};

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function asRecord(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export function parseEnableEpicBody(
  body: unknown,
): ParseResult<{ revision?: number }> {
  if (body === undefined || body === null) {
    return { ok: true, value: {} };
  }
  const raw = asRecord(body);
  if (!raw) {
    return { ok: false, message: "Invalid request body" };
  }
  if (raw.revision === undefined) {
    return { ok: true, value: {} };
  }
  if (!isRevision(raw.revision)) {
    return { ok: false, message: "revision must be a positive integer" };
  }
  return { ok: true, value: { revision: raw.revision } };
}

export function parseDisableEpicBody(
  body: unknown,
): ParseResult<{ revision: number }> {
  const raw = asRecord(body);
  if (!raw || !isRevision(raw.revision)) {
    return { ok: false, message: "revision is required as a positive integer" };
  }
  return { ok: true, value: { revision: raw.revision } };
}

const PLAN_FIELDS = [
  "description",
  "ownerIds",
  "plannedStart",
  "plannedEnd",
  "outcomeStatus",
] as const;

export function parseEpicPlanBody(body: unknown): ParseResult<EpicPlanRequest> {
  const raw = asRecord(body);
  if (!raw) {
    return { ok: false, message: "Invalid request body" };
  }
  if (!isRevision(raw.revision)) {
    return { ok: false, message: "revision is required as a positive integer" };
  }
  if (PLAN_FIELDS.every((field) => raw[field] === undefined)) {
    return {
      ok: false,
      message: `At least one of ${PLAN_FIELDS.join(", ")} is required`,
    };
  }

  const value: EpicPlanRequest = { revision: raw.revision };

  for (const field of ["description", "outcomeStatus"] as const) {
    if (raw[field] === undefined) continue;
    if (typeof raw[field] !== "string") {
      return { ok: false, message: `${field} must be a string` };
    }
    value[field] = raw[field];
  }

  if (raw.ownerIds !== undefined) {
    if (
      !Array.isArray(raw.ownerIds) ||
      raw.ownerIds.some((id) => typeof id !== "string")
    ) {
      return { ok: false, message: "ownerIds must be an array of strings" };
    }
    value.ownerIds = raw.ownerIds;
  }

  if (raw.plannedStart !== undefined || raw.plannedEnd !== undefined) {
    const { plannedStart, plannedEnd } = raw;
    if (plannedStart === null && plannedEnd === null) {
      value.plannedPeriod = null;
    } else if (
      typeof plannedStart === "string" &&
      typeof plannedEnd === "string"
    ) {
      value.plannedPeriod = { start: plannedStart, end: plannedEnd };
    } else {
      return {
        ok: false,
        message:
          "plannedStart and plannedEnd must be given together, both as YYYY-MM-DD or both as null",
      };
    }
  }

  return { ok: true, value };
}
