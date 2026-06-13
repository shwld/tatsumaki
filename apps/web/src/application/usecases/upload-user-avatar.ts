import { err, ok, type Result } from "neverthrow";
import type { User } from "../../domain/entities/user";
import type {
  UserRepository,
  UserRepositoryError,
} from "../../domain/repositories/user-repository";
import type { UserAvatarObjectStore } from "../ports/user-avatar-object-store";

export const USER_AVATAR_UPLOAD_ERROR = "USER_AVATAR_UPLOAD_ERROR" as const;
export const USER_AVATAR_NOT_FOUND_ERROR =
  "USER_AVATAR_NOT_FOUND_ERROR" as const;

export type UploadUserAvatarError =
  | typeof USER_AVATAR_UPLOAD_ERROR
  | typeof USER_AVATAR_NOT_FOUND_ERROR
  | UserRepositoryError;

export async function uploadUserAvatar(
  repository: UserRepository,
  objectStore: UserAvatarObjectStore,
  input: {
    userId: string;
    mimeType: string;
    fileBody: ReadableStream<Uint8Array>;
  },
): Promise<Result<User, UploadUserAvatarError>> {
  const fileKey = `user-avatars/${input.userId}`;
  const avatarUrl = `/api/auth/users/${input.userId}/avatar`;

  try {
    await objectStore.put(fileKey, input.fileBody, {
      contentType: input.mimeType || "application/octet-stream",
    });
  } catch {
    return err(USER_AVATAR_UPLOAD_ERROR);
  }

  const findResult = await repository.findById(input.userId);
  if (findResult.isErr()) {
    return err(findResult.error);
  }
  if (!findResult.value) {
    return err(USER_AVATAR_NOT_FOUND_ERROR);
  }

  const updatedResult = await repository.update({
    id: input.userId,
    displayName: findResult.value.displayName,
    email: findResult.value.email,
    avatarUrl,
  });

  if (updatedResult.isErr()) {
    return err(updatedResult.error);
  }
  if (!updatedResult.value) {
    return err(USER_AVATAR_NOT_FOUND_ERROR);
  }

  return ok(updatedResult.value);
}
