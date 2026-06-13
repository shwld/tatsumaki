import { err, ok, type Result } from "neverthrow";

export const INVALID_USER_DISPLAY_NAME_ERROR =
  "INVALID_USER_DISPLAY_NAME_ERROR" as const;
export const INVALID_USER_EMAIL_ERROR = "INVALID_USER_EMAIL_ERROR" as const;

export function normalizeUserDisplayName(
  value: string,
): Result<string, typeof INVALID_USER_DISPLAY_NAME_ERROR> {
  const normalized = value.trim();
  if (!normalized) {
    return err(INVALID_USER_DISPLAY_NAME_ERROR);
  }
  return ok(normalized);
}

export function normalizeUserEmail(
  value: string,
): Result<string, typeof INVALID_USER_EMAIL_ERROR> {
  const normalized = value.trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return err(INVALID_USER_EMAIL_ERROR);
  }
  return ok(normalized);
}

export function deriveInitialDisplayName(
  userId: string,
  email?: string,
): string {
  const fromEmail = email?.split("@")[0]?.trim();
  if (fromEmail) {
    return fromEmail;
  }
  return userId;
}
