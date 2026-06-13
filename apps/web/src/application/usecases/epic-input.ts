import { err, ok, type Result } from "neverthrow";

export const INVALID_EPIC_NAME_ERROR = "INVALID_EPIC_NAME_ERROR" as const;
export const INVALID_EPIC_DESCRIPTION_ERROR =
  "INVALID_EPIC_DESCRIPTION_ERROR" as const;

export function normalizeEpicName(
  name: string,
): Result<string, typeof INVALID_EPIC_NAME_ERROR> {
  const normalized = name.trim();

  if (normalized.length === 0 || normalized.length > 100) {
    return err(INVALID_EPIC_NAME_ERROR);
  }

  return ok(normalized);
}

export function normalizeEpicDescription(
  description: string,
): Result<string, typeof INVALID_EPIC_DESCRIPTION_ERROR> {
  const normalized = description.trim();

  if (normalized.length > 500) {
    return err(INVALID_EPIC_DESCRIPTION_ERROR);
  }

  return ok(normalized);
}
