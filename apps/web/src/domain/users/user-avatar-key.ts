export const USER_AVATAR_KEY_PREFIX = "user-avatars/";

export const deriveUserAvatarKey = (userId: string): string =>
  `${USER_AVATAR_KEY_PREFIX}${userId}`;

export const parseUserAvatarKey = (key: string): string =>
  key.slice(USER_AVATAR_KEY_PREFIX.length);
