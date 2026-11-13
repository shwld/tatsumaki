import { err, ok, type Result } from "neverthrow";
import type { ProjectMemberRole } from "../../domain/entities/project-member";
import type {
  StoryMap,
  StoryMapActivity,
  StoryMapCard,
  StoryMapLinkedStory,
  StoryMapSlice,
  StoryMapStructure,
  StoryMapTask,
} from "../../domain/entities/story-map";
import type {
  ProjectRepository,
  ProjectRepositoryError,
} from "../../domain/repositories/project-repository";
import type {
  StoryMapRepository,
  StoryMapRepositoryError,
} from "../../domain/repositories/story-map-repository";

import { STORY_TYPES } from "../../domain/entities/story";
import {
  STORY_MAP_GOAL_MAX,
  STORY_MAP_NOTE_MAX,
  STORY_MAP_STORY_DESCRIPTION_MAX,
  STORY_MAP_TITLE_MAX,
} from "../../shared/story-map-limits";

export const STORY_MAP_FORBIDDEN_ERROR = "STORY_MAP_FORBIDDEN_ERROR" as const;
export const STORY_MAP_NOT_FOUND_ERROR = "STORY_MAP_NOT_FOUND_ERROR" as const;
export const STORY_MAP_ARCHIVED_ERROR = "STORY_MAP_ARCHIVED_ERROR" as const;
export const STORY_MAP_ELEMENT_NOT_FOUND_ERROR =
  "STORY_MAP_ELEMENT_NOT_FOUND_ERROR" as const;
export const STORY_MAP_STORY_NOT_FOUND_ERROR =
  "STORY_MAP_STORY_NOT_FOUND_ERROR" as const;
export const STORY_MAP_STORY_ALREADY_PLACED_ERROR =
  "STORY_MAP_STORY_ALREADY_PLACED_ERROR" as const;
export const INVALID_STORY_MAP_INPUT_ERROR =
  "INVALID_STORY_MAP_INPUT_ERROR" as const;

export type ManageStoryMapError =
  | StoryMapRepositoryError
  | ProjectRepositoryError
  | typeof STORY_MAP_FORBIDDEN_ERROR
  | typeof STORY_MAP_NOT_FOUND_ERROR
  | typeof STORY_MAP_ARCHIVED_ERROR
  | typeof STORY_MAP_ELEMENT_NOT_FOUND_ERROR
  | typeof STORY_MAP_STORY_NOT_FOUND_ERROR
  | typeof STORY_MAP_STORY_ALREADY_PLACED_ERROR
  | typeof INVALID_STORY_MAP_INPUT_ERROR;

export type StoryMapDependencies = {
  storyMapRepository: StoryMapRepository;
  projectRepository: ProjectRepository;
};

type Result_<T> = Promise<Result<T, ManageStoryMapError>>;

export { STORY_MAP_GOAL_MAX, STORY_MAP_NOTE_MAX, STORY_MAP_TITLE_MAX };

type Actor = { projectId: string; userId: string };
type MapTarget = Actor & { mapId: string };

function text(
  value: string,
  max: number,
  { required }: { required: boolean },
): Result<string, ManageStoryMapError> {
  const trimmed = value.trim();
  if (trimmed.length > max || (required && trimmed === "")) {
    return err(INVALID_STORY_MAP_INPUT_ERROR);
  }
  return ok(trimmed);
}

async function requireRole(
  deps: StoryMapDependencies,
  actor: Actor,
): Result_<ProjectMemberRole> {
  const member = await deps.projectRepository.findMember(
    actor.projectId,
    actor.userId,
  );
  if (member.isErr()) {
    return err(member.error);
  }
  return member.value ? ok(member.value.role) : err(STORY_MAP_FORBIDDEN_ERROR);
}

async function loadForRead(
  deps: StoryMapDependencies,
  target: MapTarget,
): Result_<StoryMapStructure> {
  const role = await requireRole(deps, target);
  if (role.isErr()) {
    return err(role.error);
  }
  const structure = await deps.storyMapRepository.getStructure(
    target.projectId,
    target.mapId,
  );
  if (structure.isErr()) {
    return err(structure.error);
  }
  return structure.value ? ok(structure.value) : err(STORY_MAP_NOT_FOUND_ERROR);
}

/** Members who are not viewers edit; edits to an archived map are refused. */
async function loadForEdit(
  deps: StoryMapDependencies,
  target: MapTarget,
  { allowArchived = false }: { allowArchived?: boolean } = {},
): Result_<StoryMapStructure> {
  const role = await requireRole(deps, target);
  if (role.isErr()) {
    return err(role.error);
  }
  if (role.value === "viewer") {
    return err(STORY_MAP_FORBIDDEN_ERROR);
  }
  const structure = await deps.storyMapRepository.getStructure(
    target.projectId,
    target.mapId,
  );
  if (structure.isErr()) {
    return err(structure.error);
  }
  if (!structure.value) {
    return err(STORY_MAP_NOT_FOUND_ERROR);
  }
  if (structure.value.map.archivedAt !== null && !allowArchived) {
    return err(STORY_MAP_ARCHIVED_ERROR);
  }
  return ok(structure.value);
}

function hasId(items: readonly { id: string }[], id: string): boolean {
  return items.some((item) => item.id === id);
}

function notFound(): Result<never, ManageStoryMapError> {
  return err(STORY_MAP_ELEMENT_NOT_FOUND_ERROR);
}

function index(value: number | undefined): number {
  return value === undefined || !Number.isInteger(value) || value < 0
    ? Number.MAX_SAFE_INTEGER
    : value;
}

export async function listStoryMaps(
  deps: StoryMapDependencies,
  input: Actor & { includeArchived?: boolean },
): Result_<StoryMap[]> {
  const role = await requireRole(deps, input);
  if (role.isErr()) {
    return err(role.error);
  }
  return deps.storyMapRepository.listMaps(
    input.projectId,
    input.includeArchived ?? false,
  );
}

export async function getStoryMap(
  deps: StoryMapDependencies,
  target: MapTarget,
): Result_<StoryMapStructure> {
  return loadForRead(deps, target);
}

export async function createStoryMap(
  deps: StoryMapDependencies,
  input: Actor & {
    title: string;
    achievementGoal?: string;
  },
): Result_<StoryMap> {
  const role = await requireRole(deps, input);
  if (role.isErr()) {
    return err(role.error);
  }
  if (role.value === "viewer") {
    return err(STORY_MAP_FORBIDDEN_ERROR);
  }
  const title = text(input.title, STORY_MAP_TITLE_MAX, { required: true });
  const goal = text(input.achievementGoal ?? "", STORY_MAP_GOAL_MAX, {
    required: false,
  });
  if (title.isErr() || goal.isErr()) {
    return err(INVALID_STORY_MAP_INPUT_ERROR);
  }
  return deps.storyMapRepository.createMap({
    projectId: input.projectId,
    title: title.value,
    achievementGoal: goal.value,
  });
}

export async function updateStoryMap(
  deps: StoryMapDependencies,
  input: MapTarget & {
    title?: string;
    achievementGoal?: string;
    archived?: boolean;
  },
): Result_<void> {
  const loaded = await loadForEdit(deps, input, {
    allowArchived: input.archived === false,
  });
  if (loaded.isErr()) {
    return err(loaded.error);
  }
  const patch: {
    title?: string;
    achievementGoal?: string;
    archived?: boolean;
  } = {};
  if (input.title !== undefined) {
    const title = text(input.title, STORY_MAP_TITLE_MAX, { required: true });
    if (title.isErr()) return err(title.error);
    patch.title = title.value;
  }
  if (input.achievementGoal !== undefined) {
    const goal = text(input.achievementGoal, STORY_MAP_GOAL_MAX, {
      required: false,
    });
    if (goal.isErr()) return err(goal.error);
    patch.achievementGoal = goal.value;
  }
  if (input.archived !== undefined) {
    patch.archived = input.archived;
  }
  return deps.storyMapRepository.updateMap(input.mapId, patch);
}

export async function addActivity(
  deps: StoryMapDependencies,
  input: MapTarget & { title: string; index?: number },
): Result_<StoryMapActivity> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  const title = text(input.title, STORY_MAP_TITLE_MAX, { required: true });
  if (title.isErr()) return err(title.error);
  return deps.storyMapRepository.addActivity(
    input.mapId,
    title.value,
    index(input.index),
  );
}

export async function renameActivity(
  deps: StoryMapDependencies,
  input: MapTarget & { activityId: string; title: string },
): Result_<void> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  const title = text(input.title, STORY_MAP_TITLE_MAX, { required: true });
  if (title.isErr()) return err(title.error);
  if (!hasId(loaded.value.activities, input.activityId)) return notFound();
  return deps.storyMapRepository.renameActivity(
    input.mapId,
    input.activityId,
    title.value,
  );
}

export async function moveActivity(
  deps: StoryMapDependencies,
  input: MapTarget & { activityId: string; index: number },
): Result_<void> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  if (!hasId(loaded.value.activities, input.activityId)) return notFound();
  return deps.storyMapRepository.moveActivity(
    input.mapId,
    input.activityId,
    index(input.index),
  );
}

export async function deleteActivity(
  deps: StoryMapDependencies,
  input: MapTarget & { activityId: string },
): Result_<void> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  if (!hasId(loaded.value.activities, input.activityId)) return notFound();
  return deps.storyMapRepository.deleteActivity(input.mapId, input.activityId);
}

export async function addTask(
  deps: StoryMapDependencies,
  input: MapTarget & { activityId: string; title: string; index?: number },
): Result_<StoryMapTask> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  const title = text(input.title, STORY_MAP_TITLE_MAX, { required: true });
  if (title.isErr()) return err(title.error);
  if (!hasId(loaded.value.activities, input.activityId)) return notFound();
  return deps.storyMapRepository.addTask(
    input.mapId,
    input.activityId,
    title.value,
    index(input.index),
  );
}

export async function renameTask(
  deps: StoryMapDependencies,
  input: MapTarget & { taskId: string; title: string },
): Result_<void> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  const title = text(input.title, STORY_MAP_TITLE_MAX, { required: true });
  if (title.isErr()) return err(title.error);
  if (!hasId(loaded.value.tasks, input.taskId)) return notFound();
  return deps.storyMapRepository.renameTask(
    input.mapId,
    input.taskId,
    title.value,
  );
}

export async function moveTask(
  deps: StoryMapDependencies,
  input: MapTarget & { taskId: string; activityId: string; index: number },
): Result_<void> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  if (
    !hasId(loaded.value.tasks, input.taskId) ||
    !hasId(loaded.value.activities, input.activityId)
  ) {
    return notFound();
  }
  return deps.storyMapRepository.moveTask(
    input.mapId,
    input.taskId,
    input.activityId,
    index(input.index),
  );
}

export async function deleteTask(
  deps: StoryMapDependencies,
  input: MapTarget & { taskId: string },
): Result_<void> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  if (!hasId(loaded.value.tasks, input.taskId)) return notFound();
  return deps.storyMapRepository.deleteTask(input.mapId, input.taskId);
}

export async function addSlice(
  deps: StoryMapDependencies,
  input: MapTarget & { title: string; index?: number },
): Result_<StoryMapSlice> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  const title = text(input.title, STORY_MAP_TITLE_MAX, { required: true });
  if (title.isErr()) return err(title.error);
  return deps.storyMapRepository.addSlice(
    input.mapId,
    title.value,
    index(input.index),
  );
}

export async function renameSlice(
  deps: StoryMapDependencies,
  input: MapTarget & { sliceId: string; title: string },
): Result_<void> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  const title = text(input.title, STORY_MAP_TITLE_MAX, { required: true });
  if (title.isErr()) return err(title.error);
  if (!hasId(loaded.value.slices, input.sliceId)) return notFound();
  return deps.storyMapRepository.renameSlice(
    input.mapId,
    input.sliceId,
    title.value,
  );
}

export async function moveSlice(
  deps: StoryMapDependencies,
  input: MapTarget & { sliceId: string; index: number },
): Result_<void> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  if (!hasId(loaded.value.slices, input.sliceId)) return notFound();
  return deps.storyMapRepository.moveSlice(
    input.mapId,
    input.sliceId,
    index(input.index),
  );
}

export async function deleteSlice(
  deps: StoryMapDependencies,
  input: MapTarget & { sliceId: string },
): Result_<void> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  if (!hasId(loaded.value.slices, input.sliceId)) return notFound();
  return deps.storyMapRepository.deleteSlice(input.mapId, input.sliceId);
}

async function requireStoryAvailable(
  deps: StoryMapDependencies,
  structure: StoryMapStructure,
  projectId: string,
  storyId: string,
  exceptCardId?: string,
): Result_<void> {
  const exists = await deps.storyMapRepository.storyExistsInProject(
    projectId,
    storyId,
  );
  if (exists.isErr()) return err(exists.error);
  if (!exists.value) return err(STORY_MAP_STORY_NOT_FOUND_ERROR);
  const placed = structure.cards.some(
    (card) => card.storyId === storyId && card.id !== exceptCardId,
  );
  return placed ? err(STORY_MAP_STORY_ALREADY_PLACED_ERROR) : ok(undefined);
}

function checkSlice(
  structure: StoryMapStructure,
  sliceId: string | null,
): Result<void, ManageStoryMapError> {
  return sliceId === null || hasId(structure.slices, sliceId)
    ? ok(undefined)
    : err(STORY_MAP_ELEMENT_NOT_FOUND_ERROR);
}

export async function addCard(
  deps: StoryMapDependencies,
  input: MapTarget & {
    taskId: string;
    sliceId?: string | null;
    index?: number;
    ideaTitle?: string | null;
    note?: string;
    storyId?: string | null;
  },
): Result_<StoryMapCard> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  const sliceId = input.sliceId ?? null;
  const storyId = input.storyId ?? null;
  if (!hasId(loaded.value.tasks, input.taskId)) return notFound();
  const slice = checkSlice(loaded.value, sliceId);
  if (slice.isErr()) return err(slice.error);
  const ideaTitle = text(input.ideaTitle ?? "", STORY_MAP_TITLE_MAX, {
    required: storyId === null,
  });
  const note = text(input.note ?? "", STORY_MAP_NOTE_MAX, { required: false });
  if (ideaTitle.isErr()) return err(ideaTitle.error);
  if (note.isErr()) return err(note.error);
  if (storyId !== null) {
    const available = await requireStoryAvailable(
      deps,
      loaded.value,
      input.projectId,
      storyId,
    );
    if (available.isErr()) return err(available.error);
  }
  return deps.storyMapRepository.addCard({
    mapId: input.mapId,
    taskId: input.taskId,
    sliceId,
    index: index(input.index),
    ideaTitle: ideaTitle.value === "" ? null : ideaTitle.value,
    note: note.value,
    storyId,
  });
}

export async function updateCard(
  deps: StoryMapDependencies,
  input: MapTarget & {
    cardId: string;
    ideaTitle?: string | null;
    note?: string;
  },
): Result_<void> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  const card = loaded.value.cards.find((item) => item.id === input.cardId);
  if (!card) return notFound();
  const patch: { ideaTitle?: string | null; note?: string } = {};
  if (input.ideaTitle !== undefined) {
    const ideaTitle = text(input.ideaTitle ?? "", STORY_MAP_TITLE_MAX, {
      required: card.storyId === null,
    });
    if (ideaTitle.isErr()) return err(ideaTitle.error);
    patch.ideaTitle = ideaTitle.value === "" ? null : ideaTitle.value;
  }
  if (input.note !== undefined) {
    const note = text(input.note, STORY_MAP_NOTE_MAX, { required: false });
    if (note.isErr()) return err(note.error);
    patch.note = note.value;
  }
  return deps.storyMapRepository.updateCard(input.mapId, input.cardId, patch);
}

/** Moves only the card; the story it points at is never written. */
export async function moveCard(
  deps: StoryMapDependencies,
  input: MapTarget & {
    cardId: string;
    taskId: string;
    sliceId: string | null;
    index: number;
  },
): Result_<void> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  if (
    !hasId(loaded.value.cards, input.cardId) ||
    !hasId(loaded.value.tasks, input.taskId)
  ) {
    return notFound();
  }
  const slice = checkSlice(loaded.value, input.sliceId);
  if (slice.isErr()) return err(slice.error);
  return deps.storyMapRepository.moveCard(input.mapId, input.cardId, {
    taskId: input.taskId,
    sliceId: input.sliceId,
    index: index(input.index),
  });
}

/** Points the card at a story, or with null turns it back into an idea. */
export async function setCardStory(
  deps: StoryMapDependencies,
  input: MapTarget & { cardId: string; storyId: string | null },
): Result_<void> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  const card = loaded.value.cards.find((item) => item.id === input.cardId);
  if (!card) return notFound();
  if (input.storyId === null) {
    if (card.ideaTitle === null) {
      return err(INVALID_STORY_MAP_INPUT_ERROR);
    }
  } else {
    const available = await requireStoryAvailable(
      deps,
      loaded.value,
      input.projectId,
      input.storyId,
      card.id,
    );
    if (available.isErr()) return err(available.error);
  }
  return deps.storyMapRepository.setCardStory(
    input.mapId,
    input.cardId,
    input.storyId,
  );
}

export async function deleteCard(
  deps: StoryMapDependencies,
  input: MapTarget & { cardId: string },
): Result_<void> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  if (!hasId(loaded.value.cards, input.cardId)) return notFound();
  return deps.storyMapRepository.deleteCard(input.mapId, input.cardId);
}

const STORY_SEARCH_LIMIT = 20;

export type StoryMapStoryCandidate = StoryMapLinkedStory & {
  id: string;
  /** Already placed on this map, so it cannot be linked again. */
  placed: boolean;
};

/** Candidates for linking a card. Read-only; the map and its stories are untouched. */
export async function searchStoriesForCard(
  deps: StoryMapDependencies,
  input: MapTarget & { query: string },
): Result_<StoryMapStoryCandidate[]> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  const found = await deps.storyMapRepository.searchStories(
    input.projectId,
    input.query.slice(0, STORY_MAP_TITLE_MAX),
    STORY_SEARCH_LIMIT,
  );
  if (found.isErr()) return err(found.error);
  const placed = new Set(loaded.value.cards.map((card) => card.storyId));
  return ok(
    found.value.map((story) => ({ ...story, placed: placed.has(story.id) })),
  );
}

export type CreateStoryFromCardResult = {
  storyId: string;
  storyNumber: number;
};

/**
 * Turns an idea card into a new Unstarted (or Icebox) story and links it. The
 * story and the link are written in one batch; a repository bound to the live op
 * records the op id in that batch, so a retry returns this result instead of creating a second story.
 */
export async function createStoryFromCard(
  deps: StoryMapDependencies,
  input: MapTarget & {
    cardId: string;
    title: string;
    description: string;
    type: string;
    isIcebox: boolean;
  },
): Result_<CreateStoryFromCardResult> {
  const loaded = await loadForEdit(deps, input);
  if (loaded.isErr()) return err(loaded.error);
  const card = loaded.value.cards.find((item) => item.id === input.cardId);
  if (!card) return notFound();
  if (card.storyId !== null) return err(STORY_MAP_STORY_ALREADY_PLACED_ERROR);
  const title = text(input.title, STORY_MAP_TITLE_MAX, { required: true });
  const description = text(input.description, STORY_MAP_STORY_DESCRIPTION_MAX, {
    required: false,
  });
  if (title.isErr()) return err(title.error);
  if (description.isErr()) return err(description.error);
  if (!STORY_TYPES.includes(input.type as (typeof STORY_TYPES)[number])) {
    return err(INVALID_STORY_MAP_INPUT_ERROR);
  }
  if (input.type === "release") return err(INVALID_STORY_MAP_INPUT_ERROR);
  const created = await deps.storyMapRepository.createStoryForCard({
    projectId: input.projectId,
    mapId: input.mapId,
    cardId: input.cardId,
    actorUserId: input.userId,
    title: title.value,
    description: description.value,
    type: input.type,
    isIcebox: input.isIcebox,
  });
  if (created.isErr()) return err(created.error);
  return created.value
    ? ok(created.value)
    : err(STORY_MAP_STORY_ALREADY_PLACED_ERROR);
}
