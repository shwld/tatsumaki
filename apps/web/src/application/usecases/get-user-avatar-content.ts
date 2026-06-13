import { err, ok, type Result } from "neverthrow";
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
  objectStore: UserAvatarObjectStore,
  userId: string,
): Promise<Result<StoredUserAvatarObject, GetUserAvatarContentError>> {
  const fileKey = `user-avatars/${userId}`;

  let object: StoredUserAvatarObject | null;
  try {
    object = await objectStore.get(fileKey);
  } catch {
    return err(USER_AVATAR_DOWNLOAD_ERROR);
  }

  if (!object) {
    return err(USER_AVATAR_NOT_FOUND_ERROR);
  }

  return ok(object);
}
