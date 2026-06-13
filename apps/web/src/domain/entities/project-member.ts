export const PROJECT_MEMBER_ROLES = ["owner", "member", "viewer"] as const;

export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];

export type ProjectMember = {
  __typename: "ProjectMember";
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  createdAt: string;
  updatedAt: string;
};

export const PROJECT_INVITATION_STATUSES = [
  "pending",
  "accepted",
  "expired",
  "cancelled",
] as const;

export type ProjectInvitationStatus =
  (typeof PROJECT_INVITATION_STATUSES)[number];

export type ProjectInvitation = {
  __typename: "ProjectInvitation";
  id: string;
  projectId: string;
  inviterUserId: string;
  targetUserId: string | null;
  targetEmail: string | null;
  role: ProjectMemberRole;
  status: ProjectInvitationStatus;
  expiresAt: string;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
