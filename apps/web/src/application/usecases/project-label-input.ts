import { err, ok, type Result } from "neverthrow";

export const INVALID_LABEL_NAME_ERROR = "INVALID_LABEL_NAME_ERROR" as const;
export const INVALID_LABEL_COLOR_ERROR = "INVALID_LABEL_COLOR_ERROR" as const;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function normalizeLabelName(
  name: string,
): Result<string, typeof INVALID_LABEL_NAME_ERROR> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 50) {
    return err(INVALID_LABEL_NAME_ERROR);
  }
  return ok(trimmed);
}

export function normalizeLabelColor(
  color: string,
): Result<string, typeof INVALID_LABEL_COLOR_ERROR> {
  const trimmed = color.trim().toLowerCase();
  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return err(INVALID_LABEL_COLOR_ERROR);
  }
  return ok(trimmed);
}
