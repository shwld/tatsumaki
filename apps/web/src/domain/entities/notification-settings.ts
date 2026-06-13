export const NOTIFICATION_TARGET_SCOPES = [
  "assigned_only",
  "all_stories",
] as const;

export type NotificationTargetScope =
  (typeof NOTIFICATION_TARGET_SCOPES)[number];

export type NotificationSettings = {
  __typename: "NotificationSettings";
  userId: string;
  emailEnabled: boolean;
  targetScope: NotificationTargetScope;
  notifyOnStatusChanged: boolean;
  notifyOnComment: boolean;
  notifyOnEstimate: boolean;
  createdAt: string;
  updatedAt: string;
};
