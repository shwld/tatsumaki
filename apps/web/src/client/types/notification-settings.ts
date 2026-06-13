export type NotificationSettings = {
  userId: string;
  emailEnabled: boolean;
  targetScope: "assigned_only" | "all_stories";
  notifyOnStatusChanged: boolean;
  notifyOnComment: boolean;
  notifyOnEstimate: boolean;
  createdAt: string;
  updatedAt: string;
};
