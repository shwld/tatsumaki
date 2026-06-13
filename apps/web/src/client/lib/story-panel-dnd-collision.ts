import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";

function isShellDropZoneId(id: string | number): boolean {
  const s = String(id);
  return s.startsWith("drop-zone-group:") || s.startsWith("drop-zone-");
}

/** Exported for unit tests: prefer sortable story targets over panel/group shells. */
export function pickPreferredStoryCollisions<T extends { id: string | number }>(
  collisions: T[],
): T[] {
  const preferred = collisions.filter((c) => !isShellDropZoneId(c.id));
  return preferred.length > 0 ? preferred : collisions;
}

/**
 * Collision detection for multi-panel story boards: large group/panel droppables
 * must not steal `over` from story rows when the pointer is on a row.
 */
export const storyPanelCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    return pickPreferredStoryCollisions(pointerHits);
  }
  return pickPreferredStoryCollisions(closestCenter(args));
};
