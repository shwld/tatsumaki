export const POINT_SCALE_TYPES = [
  "fibonacci",
  "linear",
  "powers_of_2",
  "custom",
] as const;

export type PointScaleType = (typeof POINT_SCALE_TYPES)[number];

export const PRESET_POINT_SCALES: Record<
  Exclude<PointScaleType, "custom">,
  number[]
> = {
  fibonacci: [0, 1, 2, 3, 5, 8, 13],
  linear: [0, 1, 2, 3, 4, 5],
  powers_of_2: [0, 1, 2, 4, 8, 16],
};

export function getPointScale(
  pointScaleType: PointScaleType,
  customPointScale: number[] | null,
): number[] {
  if (pointScaleType === "custom" && customPointScale) {
    return customPointScale;
  }
  if (pointScaleType !== "custom") {
    return PRESET_POINT_SCALES[pointScaleType];
  }
  return PRESET_POINT_SCALES.fibonacci;
}

export function isValidPointScaleType(value: string): value is PointScaleType {
  return POINT_SCALE_TYPES.includes(value as PointScaleType);
}

export const SPRINT_DURATION_OPTIONS = [7, 14, 21, 28] as const;
export type SprintDuration = (typeof SPRINT_DURATION_OPTIONS)[number];

export const ITERATION_START_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type IterationStartDay = (typeof ITERATION_START_DAYS)[number];

export function isValidSprintDuration(value: number): value is SprintDuration {
  return (SPRINT_DURATION_OPTIONS as readonly number[]).includes(value);
}

export function isValidIterationStartDay(
  value: number,
): value is IterationStartDay {
  return (ITERATION_START_DAYS as readonly number[]).includes(value);
}

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

export function isValidTimezone(value: string): value is Timezone {
  return (TIMEZONE_OPTIONS as readonly string[]).includes(value);
}

export type Project = {
  __typename: "Project";
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  timezone: string;
  sprintDurationDays: SprintDuration;
  pointScaleType: PointScaleType;
  customPointScale: number[] | null;
  estimateBugs: boolean;
  estimateChores: boolean;
  iterationStartDay: IterationStartDay;
  currentUserRole?: "owner" | "member" | "viewer";
  createdAt: string;
  updatedAt: string;
};
