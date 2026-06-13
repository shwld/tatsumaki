export const STORY_TYPES = ["feature", "bug", "chore", "release"] as const;
export const DEFAULT_STORY_POINTS = [0, 1, 2, 3, 5, 8, 13] as const;
export const STORY_STATUSES = [
  "Unstarted",
  "Started",
  "Finished",
  "Delivered",
  "Accepted",
  "Rejected",
] as const;

export type StoryType = (typeof STORY_TYPES)[number];
export type StoryPoint = number;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export type StoryRelation = {
  id: string;
  title: string;
};

export type StoryAttachment = {
  __typename: "StoryAttachment";
  id: string;
  storyId: string;
  fileName: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: string;
};

export type Story = {
  __typename: "Story";
  id: string;
  storyNumber: number;
  projectId: string;
  title: string;
  description: string;
  type: StoryType;
  status: StoryStatus;
  statusChangedAt: string;
  storyPoint: StoryPoint | null;
  labels: string[];
  iterationId: string | null;
  isIcebox: boolean;
  ownerIds: string[];
  requesterId: string | null;
  releaseDate: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  isBlocked?: boolean;
  isBlocking?: boolean;
  blockingStories?: StoryRelation[];
  blockedStories?: StoryRelation[];
};

export type StoryPriorityHistory = {
  __typename: "StoryPriorityHistory";
  id: string;
  storyId: string;
  fromPosition: number;
  toPosition: number;
  changedAt: string;
};

export type StoryTimelineField =
  | "title"
  | "description"
  | "type"
  | "status"
  | "storyPoint"
  | "labels"
  | "story";

export type ProjectHistoryAction = "field_changed" | "created" | "deleted";

export type ProjectHistoryEntry = {
  __typename: "ProjectHistoryEntry";
  id: string;
  storyId: string | null;
  storyTitle: string | null;
  actorUserId: string | null;
  actorName: string;
  action: ProjectHistoryAction;
  fieldName: StoryTimelineField;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

export type ProjectHistoryResponse = {
  history: ProjectHistoryEntry[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type StoryTimelineActivityAction =
  | "field_changed"
  | "created"
  | "deleted";

export type StoryTimelineActivityEntry = {
  __typename: "StoryTimelineActivityEntry";
  entryType: "activity";
  id: string;
  storyId: string;
  actorUserId: string | null;
  actorName: string;
  action: StoryTimelineActivityAction;
  fieldName: StoryTimelineField;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

export type StoryTimelineCommentEntry = {
  __typename: "StoryTimelineCommentEntry";
  entryType: "comment";
  id: string;
  storyId: string;
  actorUserId: string | null;
  actorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type StoryTimelineEntry =
  | StoryTimelineActivityEntry
  | StoryTimelineCommentEntry;

export type StoriesResponse = {
  stories: Story[];
  pagination?: {
    limit: number;
    offset: number;
    hasNext: boolean;
    hasPrev: boolean;
    nextOffset: number | null;
    prevOffset: number | null;
    total?: number;
    summary?: {
      totalPoints?: number;
      pointsByIterationId?: Record<string, number>;
    };
  };
};

export type StoryResponse = {
  story: Story;
};

export type StoryPriorityHistoryResponse = {
  history: StoryPriorityHistory[];
};

export type StoryTimelineResponse = {
  timeline: StoryTimelineEntry[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type StoryAttachmentsResponse = {
  attachments: StoryAttachment[];
};
