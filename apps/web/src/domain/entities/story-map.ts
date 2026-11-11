export type StoryMapPersona = {
  id: string;
  name: string;
  position: number;
};

export type StoryMap = {
  __typename: "StoryMap";
  id: string;
  projectId: string;
  title: string;
  achievementGoal: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoryMapActivity = { id: string; title: string; position: number };

export type StoryMapTask = {
  id: string;
  activityId: string;
  title: string;
  position: number;
};

/** A map-owned release row. It is independent of iterations, release stories and Backlog order. */
export type StoryMapSlice = { id: string; title: string; position: number };

/**
 * idea: never linked to a story. linked: the story exists. missing: the card
 * was linked and the story has since been deleted.
 */
export type StoryMapCardStoryState = "idea" | "linked" | "missing";

/** What a linked card shows of its story; the story stays the source of truth. */
export type StoryMapLinkedStory = {
  number: number;
  title: string;
  status: string;
  type: string;
  storyPoint: number | null;
  isIcebox: boolean;
};

export type StoryMapCard = {
  id: string;
  taskId: string;
  /** null is the unplanned row. */
  sliceId: string | null;
  position: number;
  ideaTitle: string | null;
  note: string;
  storyId: string | null;
  storyState: StoryMapCardStoryState;
  /** Set only while storyState is "linked". */
  story: StoryMapLinkedStory | null;
};

export type StoryMapStructure = {
  map: StoryMap;
  personas: StoryMapPersona[];
  activities: StoryMapActivity[];
  tasks: StoryMapTask[];
  slices: StoryMapSlice[];
  cards: StoryMapCard[];
};
