import type { Result } from "neverthrow";
import type {
  StoryMap,
  StoryMapActivity,
  StoryMapCard,
  StoryMapPersona,
  StoryMapSlice,
  StoryMapStructure,
  StoryMapTask,
} from "../entities/story-map";

export const STORY_MAP_REPOSITORY_ERROR = "STORY_MAP_REPOSITORY_ERROR" as const;

export type StoryMapRepositoryError = typeof STORY_MAP_REPOSITORY_ERROR;

type Repo<T> = Promise<Result<T, StoryMapRepositoryError>>;

/**
 * Every method writes only story map tables. Moving or removing a card never
 * touches `stories`. `index` is the 0-based place among siblings; values past
 * the end append.
 */
export interface StoryMapRepository {
  listMaps(projectId: string, includeArchived: boolean): Repo<StoryMap[]>;
  /** Null when the map does not exist in the project. */
  getStructure(
    projectId: string,
    mapId: string,
  ): Repo<StoryMapStructure | null>;
  createMap(input: {
    projectId: string;
    title: string;
    achievementGoal: string;
    personaNames: string[];
  }): Repo<StoryMap>;
  updateMap(
    mapId: string,
    patch: { title?: string; achievementGoal?: string; archived?: boolean },
  ): Repo<void>;

  addPersona(mapId: string, name: string): Repo<StoryMapPersona>;
  renamePersona(mapId: string, personaId: string, name: string): Repo<void>;
  removePersona(mapId: string, personaId: string): Repo<void>;

  addActivity(
    mapId: string,
    title: string,
    index: number,
  ): Repo<StoryMapActivity>;
  renameActivity(mapId: string, activityId: string, title: string): Repo<void>;
  moveActivity(mapId: string, activityId: string, index: number): Repo<void>;
  /** Removes the activity with its tasks and their cards. */
  deleteActivity(mapId: string, activityId: string): Repo<void>;

  addTask(
    mapId: string,
    activityId: string,
    title: string,
    index: number,
  ): Repo<StoryMapTask>;
  renameTask(mapId: string, taskId: string, title: string): Repo<void>;
  moveTask(
    mapId: string,
    taskId: string,
    activityId: string,
    index: number,
  ): Repo<void>;
  /** Removes the task with its cards. */
  deleteTask(mapId: string, taskId: string): Repo<void>;

  addSlice(mapId: string, title: string, index: number): Repo<StoryMapSlice>;
  renameSlice(mapId: string, sliceId: string, title: string): Repo<void>;
  moveSlice(mapId: string, sliceId: string, index: number): Repo<void>;
  /** Cards of the slice return to the unplanned row. */
  deleteSlice(mapId: string, sliceId: string): Repo<void>;

  addCard(input: {
    mapId: string;
    taskId: string;
    sliceId: string | null;
    index: number;
    ideaTitle: string | null;
    note: string;
    storyId: string | null;
  }): Repo<StoryMapCard>;
  updateCard(
    mapId: string,
    cardId: string,
    patch: { ideaTitle?: string | null; note?: string },
  ): Repo<void>;
  moveCard(
    mapId: string,
    cardId: string,
    to: { taskId: string; sliceId: string | null; index: number },
  ): Repo<void>;
  setCardStory(
    mapId: string,
    cardId: string,
    storyId: string | null,
  ): Repo<void>;
  deleteCard(mapId: string, cardId: string): Repo<void>;

  /** Whether the story exists in the project (archived stories count). */
  storyExistsInProject(projectId: string, storyId: string): Repo<boolean>;
}
