import { err, ok, type Result } from "neverthrow";
import type { User } from "../../domain/entities/user";
import type {
  UserRepository,
  UserRepositoryError,
} from "../../domain/repositories/user-repository";
import {
  deriveInitialDisplayName,
  normalizeUserEmail,
} from "./current-user-input";

export const CURRENT_USER_EMAIL_REQUIRED_ERROR =
  "CURRENT_USER_EMAIL_REQUIRED_ERROR" as const;

export type GetOrCreateCurrentUserError =
  | typeof CURRENT_USER_EMAIL_REQUIRED_ERROR
  | UserRepositoryError;

export async function getOrCreateCurrentUser(
  repository: UserRepository,
  input: { id: string; accessEmail?: string },
): Promise<Result<User, GetOrCreateCurrentUserError>> {
  const existingResult = await repository.findById(input.id);
  if (existingResult.isErr()) {
    return err(existingResult.error);
  }

  if (existingResult.value) {
    return ok(existingResult.value);
  }

  const normalizedEmail = normalizeUserEmail(input.accessEmail ?? "");
  if (normalizedEmail.isErr()) {
    return err(CURRENT_USER_EMAIL_REQUIRED_ERROR);
  }

  const createdResult = await repository.create({
    id: input.id,
    displayName: deriveInitialDisplayName(input.id, normalizedEmail.value),
    email: normalizedEmail.value,
  });
  if (createdResult.isErr()) {
    return err(createdResult.error);
  }

  return ok(createdResult.value);
}
