import { err, ok, type Result } from "neverthrow";
import type { Story } from "../../domain/entities/story";
import {
  STORY_ARCHIVED_ERROR,
  type StoryRepository,
  type StoryRepositoryError,
} from "../../domain/repositories/story-repository";
import { reorderStories } from "./reorder-stories";

export const STORY_MOVE_TARGET_NOT_FOUND_ERROR =
  "STORY_MOVE_TARGET_NOT_FOUND_ERROR" as const;
export const STORY_MOVE_ANCHOR_NOT_FOUND_ERROR =
  "STORY_MOVE_ANCHOR_NOT_FOUND_ERROR" as const;
export const STORY_MOVE_NOT_IN_BACKLOG_ERROR =
  "STORY_MOVE_NOT_IN_BACKLOG_ERROR" as const;
export const STORY_MOVE_ANCHOR_IS_TARGET_ERROR =
  "STORY_MOVE_ANCHOR_IS_TARGET_ERROR" as const;
export const INVALID_STORY_PLACEMENT_ERROR =
  "INVALID_STORY_PLACEMENT_ERROR" as const;

export type StoryPlacement =
  | { position: "top" }
  | { position: "end" }
  | { position: "after" | "before"; relativeToStoryNumber: number };

export type MoveStoryToPositionError =
  | StoryRepositoryError
  | typeof STORY_MOVE_TARGET_NOT_FOUND_ERROR
  | typeof STORY_MOVE_ANCHOR_NOT_FOUND_ERROR
  | typeof STORY_MOVE_NOT_IN_BACKLOG_ERROR
  | typeof STORY_MOVE_ANCHOR_IS_TARGET_ERROR
  | typeof INVALID_STORY_PLACEMENT_ERROR;

export function parseStoryPlacement(
  value: unknown,
): Result<StoryPlacement, typeof INVALID_STORY_PLACEMENT_ERROR> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return err(INVALID_STORY_PLACEMENT_ERROR);
  }
  const { position, relativeToStoryNumber } = value as Record<string, unknown>;
  if (position === "top" || position === "end") {
    return relativeToStoryNumber === undefined
      ? ok({ position })
      : err(INVALID_STORY_PLACEMENT_ERROR);
  }
  if (
    (position === "after" || position === "before") &&
    typeof relativeToStoryNumber === "number" &&
    Number.isInteger(relativeToStoryNumber) &&
    relativeToStoryNumber > 0
  ) {
    return ok({ position, relativeToStoryNumber });
  }
  return err(INVALID_STORY_PLACEMENT_ERROR);
}

/**
 * Ids to hand to `StoryRepository.reorder` so that `targetId` lands at the
 * requested place while every other story keeps its relative order. Reorder
 * only permutes the positions the listed stories already occupy, so listing
 * the window between the old and the new index is enough.
 */
export function planStoryMove(
  backlogIds: readonly string[],
  targetId: string,
  placement: StoryPlacement,
  anchorId: string | null,
): string[] {
  const oldIndex = backlogIds.indexOf(targetId);
  const rest = backlogIds.filter((id) => id !== targetId);
  let newIndex: number;
  if (placement.position === "top") {
    newIndex = 0;
  } else if (placement.position === "end") {
    newIndex = rest.length;
  } else {
    const anchorIndex = rest.indexOf(anchorId ?? "");
    newIndex = placement.position === "after" ? anchorIndex + 1 : anchorIndex;
  }
  const moved = [...rest.slice(0, newIndex), targetId, ...rest.slice(newIndex)];
  const low = Math.min(oldIndex, newIndex);
  const high = Math.max(oldIndex, newIndex);
  return moved.slice(low, high + 1);
}

/** Rejects a placement whose anchor cannot be used, before anything is written. */
export async function resolveStoryPlacementAnchor(
  repository: StoryRepository,
  projectId: string,
  placement: StoryPlacement,
  targetStoryNumber?: number,
): Promise<Result<Story | null, MoveStoryToPositionError>> {
  if (placement.position === "top" || placement.position === "end") {
    return ok(null);
  }
  if (placement.relativeToStoryNumber === targetStoryNumber) {
    return err(STORY_MOVE_ANCHOR_IS_TARGET_ERROR);
  }
  const anchor = await repository.findByStoryNumber(
    projectId,
    placement.relativeToStoryNumber,
  );
  if (anchor.isErr()) {
    return err(anchor.error);
  }
  if (!anchor.value) {
    return err(STORY_MOVE_ANCHOR_NOT_FOUND_ERROR);
  }
  if (anchor.value.archivedAt !== null) {
    return err(STORY_ARCHIVED_ERROR);
  }
  if (anchor.value.isIcebox) {
    return err(STORY_MOVE_NOT_IN_BACKLOG_ERROR);
  }
  return ok(anchor.value);
}

export async function moveStoryToPosition(
  repository: StoryRepository,
  input: {
    projectId: string;
    storyNumber: number;
    placement: StoryPlacement;
  },
): Promise<Result<Story[], MoveStoryToPositionError>> {
  const { projectId, storyNumber, placement } = input;
  const target = await repository.findByStoryNumber(projectId, storyNumber);
  if (target.isErr()) {
    return err(target.error);
  }
  if (!target.value) {
    return err(STORY_MOVE_TARGET_NOT_FOUND_ERROR);
  }
  if (target.value.archivedAt !== null) {
    return err(STORY_ARCHIVED_ERROR);
  }
  if (target.value.isIcebox) {
    return err(STORY_MOVE_NOT_IN_BACKLOG_ERROR);
  }

  const anchor = await resolveStoryPlacementAnchor(
    repository,
    projectId,
    placement,
    storyNumber,
  );
  if (anchor.isErr()) {
    return err(anchor.error);
  }

  const listed = await repository.list({
    projectId,
    archived: "exclude",
    isIcebox: false,
    order: "positionAsc",
    detailLevel: "summary",
  });
  if (listed.isErr()) {
    return err(listed.error);
  }
  const backlogIds = listed.value.map((story) => story.id);
  if (!backlogIds.includes(target.value.id)) {
    return err(STORY_MOVE_NOT_IN_BACKLOG_ERROR);
  }

  const orderedIds = planStoryMove(
    backlogIds,
    target.value.id,
    placement,
    anchor.value?.id ?? null,
  );
  if (orderedIds.length <= 1) {
    return ok(listed.value);
  }

  const reordered = await reorderStories(repository, projectId, orderedIds);
  if (reordered.isErr()) {
    return err(
      reordered.error === "INVALID_STORY_ORDER_ERROR"
        ? STORY_MOVE_NOT_IN_BACKLOG_ERROR
        : reordered.error,
    );
  }
  return ok(reordered.value);
}
