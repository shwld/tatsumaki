import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import type { StoryMapStructure } from "../../domain/entities/story-map";
import {
  addActivity,
  addCard,
  addSlice,
  addTask,
  createStoryFromCard,
  deleteActivity,
  deleteCard,
  deleteSlice,
  deleteTask,
  INVALID_STORY_MAP_INPUT_ERROR,
  type ManageStoryMapError,
  moveActivity,
  moveCard,
  moveSlice,
  moveTask,
  renameActivity,
  renameSlice,
  renameTask,
  STORY_MAP_ARCHIVED_ERROR,
  STORY_MAP_ELEMENT_NOT_FOUND_ERROR,
  STORY_MAP_FORBIDDEN_ERROR,
  STORY_MAP_NOT_FOUND_ERROR,
  STORY_MAP_STORY_ALREADY_PLACED_ERROR,
  STORY_MAP_STORY_NOT_FOUND_ERROR,
  type StoryMapDependencies,
  setCardStory,
  updateCard,
  updateStoryMap,
} from "./manage-story-maps";

/** Largest map the live snapshot is designed to carry (ADR-0014 §5). */
export const STORY_MAP_CARD_LIMIT = 2000;

const id = z.string().min(1).max(64);
/** The sibling to place after; null places at the start. */
const after = id.nullable();

export const storyMapCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("updateMap"),
    title: z.string().optional(),
    achievementGoal: z.string().optional(),
    archived: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal("addActivity"),
    title: z.string(),
    afterActivityId: after,
  }),
  z.strictObject({
    type: z.literal("renameActivity"),
    activityId: id,
    title: z.string(),
  }),
  z.strictObject({
    type: z.literal("moveActivity"),
    activityId: id,
    afterActivityId: after,
  }),
  z.strictObject({ type: z.literal("deleteActivity"), activityId: id }),
  z.strictObject({
    type: z.literal("addTask"),
    activityId: id,
    title: z.string(),
    afterTaskId: after,
  }),
  z.strictObject({
    type: z.literal("renameTask"),
    taskId: id,
    title: z.string(),
  }),
  z.strictObject({
    type: z.literal("moveTask"),
    taskId: id,
    activityId: id,
    afterTaskId: after,
  }),
  z.strictObject({ type: z.literal("deleteTask"), taskId: id }),
  z.strictObject({
    type: z.literal("addSlice"),
    title: z.string(),
    afterSliceId: after,
  }),
  z.strictObject({
    type: z.literal("renameSlice"),
    sliceId: id,
    title: z.string(),
  }),
  z.strictObject({
    type: z.literal("moveSlice"),
    sliceId: id,
    afterSliceId: after,
  }),
  z.strictObject({ type: z.literal("deleteSlice"), sliceId: id }),
  z.strictObject({
    type: z.literal("addCard"),
    taskId: id,
    sliceId: id.nullable(),
    afterCardId: after,
    ideaTitle: z.string().nullable().optional(),
    note: z.string().optional(),
    storyId: id.nullable().optional(),
  }),
  z.strictObject({
    type: z.literal("updateCard"),
    cardId: id,
    ideaTitle: z.string().nullable().optional(),
    note: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("moveCard"),
    cardId: id,
    taskId: id,
    sliceId: id.nullable(),
    afterCardId: after,
  }),
  z.strictObject({
    type: z.literal("setCardStory"),
    cardId: id,
    storyId: id.nullable(),
  }),
  z.strictObject({ type: z.literal("deleteCard"), cardId: id }),
  z.strictObject({
    type: z.literal("createStoryFromCard"),
    cardId: id,
    title: z.string(),
    description: z.string(),
    storyType: z.enum(["feature", "bug", "chore"]),
    isIcebox: z.boolean(),
  }),
]);

export type StoryMapCommand = z.infer<typeof storyMapCommandSchema>;

export type StoryMapCommandRejection =
  | "invalid"
  | "forbidden"
  | "not_found"
  | "archived"
  | "target_gone"
  | "story_unavailable"
  | "limit"
  | "internal";

export function parseStoryMapCommand(
  raw: unknown,
): Result<StoryMapCommand, "invalid"> {
  const parsed = storyMapCommandSchema.safeParse(raw);
  return parsed.success ? ok(parsed.data) : err("invalid");
}

export function rejectionOf(
  error: ManageStoryMapError,
): StoryMapCommandRejection {
  switch (error) {
    case INVALID_STORY_MAP_INPUT_ERROR:
      return "invalid";
    case STORY_MAP_FORBIDDEN_ERROR:
      return "forbidden";
    case STORY_MAP_NOT_FOUND_ERROR:
      return "not_found";
    case STORY_MAP_ARCHIVED_ERROR:
      return "archived";
    case STORY_MAP_ELEMENT_NOT_FOUND_ERROR:
      return "target_gone";
    case STORY_MAP_STORY_NOT_FOUND_ERROR:
    case STORY_MAP_STORY_ALREADY_PLACED_ERROR:
      return "story_unavailable";
    default:
      return "internal";
  }
}

type Sibling = { id: string; position: number };

/**
 * Index to insert at so the item lands right after `afterId`. Null when
 * `afterId` is not among the siblings any more (it was deleted or moved away).
 */
function indexAfter(
  siblings: readonly Sibling[],
  movingId: string | null,
  afterId: string | null,
): number | null {
  const ordered = siblings
    .filter((item) => item.id !== movingId)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  if (afterId === null) {
    return 0;
  }
  const at = ordered.findIndex((item) => item.id === afterId);
  return at === -1 ? null : at + 1;
}

type Target = {
  projectId: string;
  userId: string;
  mapId: string;
};

/**
 * Runs one live command through the same usecases an HTTP caller would use, so
 * permission, archive and reference checks are identical. `structure` is the
 * state the placement is computed from; the caller holds the per-map lock.
 */
export async function applyStoryMapCommand(
  deps: StoryMapDependencies,
  target: Target,
  structure: StoryMapStructure,
  command: StoryMapCommand,
): Promise<Result<unknown, StoryMapCommandRejection>> {
  const run = async <T>(
    result: Promise<Result<T, ManageStoryMapError>>,
  ): Promise<Result<unknown, StoryMapCommandRejection>> => {
    const settled = await result;
    return settled.isOk()
      ? ok(settled.value ?? null)
      : err(rejectionOf(settled.error));
  };
  const gone = err<never, StoryMapCommandRejection>("target_gone");

  switch (command.type) {
    case "updateMap":
      return run(updateStoryMap(deps, { ...target, ...command }));
    case "addActivity": {
      const at = indexAfter(
        structure.activities,
        null,
        command.afterActivityId,
      );
      return at === null
        ? gone
        : run(
            addActivity(deps, { ...target, title: command.title, index: at }),
          );
    }
    case "renameActivity":
      return run(renameActivity(deps, { ...target, ...command }));
    case "moveActivity": {
      const at = indexAfter(
        structure.activities,
        command.activityId,
        command.afterActivityId,
      );
      return at === null
        ? gone
        : run(
            moveActivity(deps, {
              ...target,
              activityId: command.activityId,
              index: at,
            }),
          );
    }
    case "deleteActivity":
      return run(deleteActivity(deps, { ...target, ...command }));
    case "addTask": {
      const at = indexAfter(
        structure.tasks.filter(
          (task) => task.activityId === command.activityId,
        ),
        null,
        command.afterTaskId,
      );
      return at === null
        ? gone
        : run(
            addTask(deps, {
              ...target,
              activityId: command.activityId,
              title: command.title,
              index: at,
            }),
          );
    }
    case "renameTask":
      return run(renameTask(deps, { ...target, ...command }));
    case "moveTask": {
      const at = indexAfter(
        structure.tasks.filter(
          (task) => task.activityId === command.activityId,
        ),
        command.taskId,
        command.afterTaskId,
      );
      return at === null
        ? gone
        : run(
            moveTask(deps, {
              ...target,
              taskId: command.taskId,
              activityId: command.activityId,
              index: at,
            }),
          );
    }
    case "deleteTask":
      return run(deleteTask(deps, { ...target, ...command }));
    case "addSlice": {
      const at = indexAfter(structure.slices, null, command.afterSliceId);
      return at === null
        ? gone
        : run(addSlice(deps, { ...target, title: command.title, index: at }));
    }
    case "renameSlice":
      return run(renameSlice(deps, { ...target, ...command }));
    case "moveSlice": {
      const at = indexAfter(
        structure.slices,
        command.sliceId,
        command.afterSliceId,
      );
      return at === null
        ? gone
        : run(
            moveSlice(deps, {
              ...target,
              sliceId: command.sliceId,
              index: at,
            }),
          );
    }
    case "deleteSlice":
      return run(deleteSlice(deps, { ...target, ...command }));
    case "addCard": {
      if (structure.cards.length >= STORY_MAP_CARD_LIMIT) {
        return err("limit");
      }
      const at = indexAfter(
        cardsInCell(structure, command.taskId, command.sliceId),
        null,
        command.afterCardId,
      );
      if (at === null) return gone;
      const { type: _type, afterCardId: _after, ...card } = command;
      return run(addCard(deps, { ...target, ...card, index: at }));
    }
    case "updateCard":
      return run(updateCard(deps, { ...target, ...command }));
    case "moveCard": {
      const at = indexAfter(
        cardsInCell(structure, command.taskId, command.sliceId),
        command.cardId,
        command.afterCardId,
      );
      return at === null
        ? gone
        : run(
            moveCard(deps, {
              ...target,
              cardId: command.cardId,
              taskId: command.taskId,
              sliceId: command.sliceId,
              index: at,
            }),
          );
    }
    case "setCardStory":
      return run(setCardStory(deps, { ...target, ...command }));
    case "deleteCard":
      return run(deleteCard(deps, { ...target, ...command }));
    case "createStoryFromCard":
      return run(
        createStoryFromCard(deps, {
          ...target,
          cardId: command.cardId,
          title: command.title,
          description: command.description,
          type: command.storyType,
          isIcebox: command.isIcebox,
        }),
      );
  }
}

function cardsInCell(
  structure: StoryMapStructure,
  taskId: string,
  sliceId: string | null,
): Sibling[] {
  return structure.cards.filter(
    (card) => card.taskId === taskId && card.sliceId === sliceId,
  );
}
