export const STORY_ACTIVITY_ACTIONS = [
  "field_changed",
  "created",
  "deleted",
] as const;
export const STORY_ACTIVITY_FIELDS = [
  "title",
  "description",
  "type",
  "status",
  "storyPoint",
  "labels",
  "story",
] as const;

export type StoryActivityAction = (typeof STORY_ACTIVITY_ACTIONS)[number];
export type StoryActivityField = (typeof STORY_ACTIVITY_FIELDS)[number];

export type StoryActivity = {
  __typename: "StoryActivity";
  id: string;
  storyId: string;
  actorUserId: string | null;
  actorName: string;
  action: StoryActivityAction;
  fieldName: StoryActivityField;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

export type StoryComment = {
  __typename: "StoryComment";
  id: string;
  storyId: string;
  userId: string;
  actorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type StoryTimelineActivityEntry = {
  __typename: "StoryTimelineActivityEntry";
  entryType: "activity";
  id: string;
  storyId: string;
  actorUserId: string | null;
  actorName: string;
  action: StoryActivityAction;
  fieldName: StoryActivityField;
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

export type ProjectHistoryEntry = {
  __typename: "ProjectHistoryEntry";
  id: string;
  storyId: string | null;
  storyTitle: string | null;
  actorUserId: string | null;
  actorName: string;
  action: StoryActivityAction;
  fieldName: StoryActivityField;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};
