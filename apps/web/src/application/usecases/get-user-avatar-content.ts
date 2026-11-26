import { err, ok, type Result } from "neverthrow";
import type { UserRepository } from "../../domain/repositories/user-repository";
import { deriveUserAvatarKey } from "../../domain/users/user-avatar-key";
import type {
  StoredUserAvatarObject,
  UserAvatarObjectStore,
} from "../ports/user-avatar-object-store";

export const USER_AVATAR_NOT_FOUND_ERROR =
  "USER_AVATAR_NOT_FOUND_ERROR" as const;
export const USER_AVATAR_DOWNLOAD_ERROR = "USER_AVATAR_DOWNLOAD_ERROR" as const;

export type GetUserAvatarContentError =
  | typeof USER_AVATAR_NOT_FOUND_ERROR
  | typeof USER_AVATAR_DOWNLOAD_ERROR;

export async function getUserAvatarContent(
  repository: UserRepository,
  objectStore: UserAvatarObjectStore,
  userId: string,
): Promise<Result<StoredUserAvatarObject, GetUserAvatarContentError>> {
  let object: StoredUserAvatarObject | null;
  try {
    const user = await repository.findById(userId);
    if (user.isErr()) {
      return err(USER_AVATAR_DOWNLOAD_ERROR);
    }
    // The object outlives a deleted account until the next sweep.
    if (!user.value?.avatarUrl) {
      return err(USER_AVATAR_NOT_FOUND_ERROR);
    }
    object = await objectStore.get(deriveUserAvatarKey(userId));
  } catch {
    return err(USER_AVATAR_DOWNLOAD_ERROR);
  }

  if (!object) {
    return err(USER_AVATAR_NOT_FOUND_ERROR);
  }

  return ok(object);
}
