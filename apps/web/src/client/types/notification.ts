export type NotificationKind =
  | "status_changed"
  | "estimate_changed"
  | "comment_added"
  | "mention"
  | "member_invitation"
  | "story_activity";

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
