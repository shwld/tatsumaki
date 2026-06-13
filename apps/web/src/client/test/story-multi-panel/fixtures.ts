import type { Iteration } from "../../types/iteration";
import type { Story } from "../../types/story";

export const PROJECT_ID = "project-1";
export const CURRENT_ITERATION_ID = "iter-current";

const today = new Date();
const iterationStart = new Date(today);
iterationStart.setDate(today.getDate() - 3);
const iterationEnd = new Date(today);
iterationEnd.setDate(today.getDate() + 11);

export const BASE_ITERATIONS: Iteration[] = [
  {
    __typename: "Iteration",
    id: CURRENT_ITERATION_ID,
    projectId: PROJECT_ID,
    startDate: iterationStart.toISOString().slice(0, 10),
    endDate: iterationEnd.toISOString().slice(0, 10),
    totalPoints: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

export const BASE_STORIES: Story[] = [
  {
    __typename: "Story",
    id: "story-unstarted",
    storyNumber: 1,
    projectId: PROJECT_ID,
    title: "Backlog story",
    description: "has search needle",
    type: "feature",
    status: "Unstarted",
    statusChangedAt: "2026-01-01T00:00:00.000Z",
    storyPoint: 3,
    labels: ["priority:high"],
    iterationId: null,
    isIcebox: false,
    ownerIds: [],
    requesterId: null,
    releaseDate: null,
    position: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    __typename: "Story",
    id: "story-started",
    storyNumber: 2,
    projectId: PROJECT_ID,
    title: "Current story",
    description: "Current story",
    type: "bug",
    status: "Started",
    statusChangedAt: "2026-01-01T00:00:00.000Z",
    storyPoint: 2,
    labels: ["backend"],
    iterationId: CURRENT_ITERATION_ID,
    isIcebox: false,
    ownerIds: [],
    requesterId: null,
    releaseDate: null,
    position: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    __typename: "Story",
    id: "story-accepted",
    storyNumber: 3,
    projectId: PROJECT_ID,
    title: "Done story",
    description: "Done work",
    type: "chore",
    status: "Accepted",
    statusChangedAt: "2026-01-01T00:00:00.000Z",
    storyPoint: 5,
    labels: ["done-tag"],
    iterationId: null,
    isIcebox: false,
    ownerIds: [],
    requesterId: null,
    releaseDate: null,
    position: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];
