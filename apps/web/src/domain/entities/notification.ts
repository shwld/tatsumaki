export const NOTIFICATION_KINDS = [
  "status_changed",
  "estimate_changed",
  "comment_added",
  "mention",
  "member_invitation",
  "story_activity",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type Notification = {
  __typename: "Notification";
  id: string;
  projectId: string;
  kind: NotificationKind;
  storyId: string | null;
  storyTitle: string | null;
  invitationId: string | null;
  actorUserId: string | null;
  actorName: string;
  createdAt: string;
  message: string;
  readAt: string | null;
};
