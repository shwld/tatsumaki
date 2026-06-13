export const POINT_SCALE_TYPES = [
  "fibonacci",
  "linear",
  "powers_of_2",
  "custom",
] as const;

export type PointScaleType = (typeof POINT_SCALE_TYPES)[number];

export const SPRINT_DURATION_OPTIONS = [7, 14, 21, 28] as const;
export type SprintDuration = (typeof SPRINT_DURATION_OPTIONS)[number];

export const ITERATION_START_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type IterationStartDay = (typeof ITERATION_START_DAYS)[number];

export const TIMEZONE_OPTIONS = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Atlantic/Reykjavik",
  "Europe/London",
  "Europe/Paris",
  "Europe/Helsinki",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

export type Timezone = (typeof TIMEZONE_OPTIONS)[number];

export type Project = {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  timezone: string;
  sprintDurationDays: SprintDuration;
  pointScaleType: PointScaleType;
  customPointScale: number[] | null;
  pointScale?: number[];
  estimateBugs: boolean;
  estimateChores: boolean;
  iterationStartDay: IterationStartDay;
  currentUserRole?: "owner" | "member" | "viewer";
};

export type ProjectsResponse = {
  projects?: Project[];
};

export type ProjectMemberRole = "owner" | "member" | "viewer";

/** 表示用 DTO。ロール情報を持つドメイン型 ProjectMember とは責務が異なる。 */
export type ProjectMemberProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  gravatarUrl: string | null;
};

export type ProjectMember = {
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  createdAt: string;
  updatedAt: string;
};

export type ProjectInvitationStatus =
  | "pending"
  | "accepted"
  | "expired"
  | "cancelled";

export type ProjectInvitation = {
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
