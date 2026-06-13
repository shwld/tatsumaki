import { err, ok, type Result } from "neverthrow";
import type { User } from "../../domain/entities/user";
import type {
  UserRepository,
  UserRepositoryError,
} from "../../domain/repositories/user-repository";
import {
  INVALID_USER_DISPLAY_NAME_ERROR,
  INVALID_USER_EMAIL_ERROR,
  normalizeUserDisplayName,
  normalizeUserEmail,
} from "./current-user-input";

export const CURRENT_USER_NOT_FOUND_ERROR =
  "CURRENT_USER_NOT_FOUND_ERROR" as const;

export type UpdateCurrentUserError =
  | typeof INVALID_USER_DISPLAY_NAME_ERROR
  | typeof INVALID_USER_EMAIL_ERROR
  | typeof CURRENT_USER_NOT_FOUND_ERROR
  | UserRepositoryError;

export async function updateCurrentUser(
  repository: UserRepository,
  input: { id: string; displayName: string; email: string },
): Promise<Result<User, UpdateCurrentUserError>> {
  const displayName = normalizeUserDisplayName(input.displayName);
  if (displayName.isErr()) {
    return err(displayName.error);
  }

  const email = normalizeUserEmail(input.email);
  if (email.isErr()) {
    return err(email.error);
  }

  const updatedResult = await repository.update({
    id: input.id,
    displayName: displayName.value,
    email: email.value,
  });
  if (updatedResult.isErr()) {
    return err(updatedResult.error);
  }
  if (!updatedResult.value) {
    return err(CURRENT_USER_NOT_FOUND_ERROR);
  }

  return ok(updatedResult.value);
}
