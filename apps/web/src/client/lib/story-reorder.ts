export function reorderStoriesById<T extends { id: string }>(
  stories: T[],
  activeId: string,
  overId: string,
): T[] | null {
  const activeIndex = stories.findIndex((story) => story.id === activeId);
  const overIndex = stories.findIndex((story) => story.id === overId);

  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return null;
  }

  const reordered = [...stories];
  const [moved] = reordered.splice(activeIndex, 1);
  reordered.splice(overIndex, 0, moved);
  return reordered;
}

/**
 * Insert a story moved from another panel at the hovered row.
 *
 * Group and panel drop-zone ids represent the destination list rather than a
 * sortable row, so they resolve to the beginning of the list. Appending here
 * makes a drop on the Current sprint header appear ineffective when release
 * markers already occupy the list.
 */
export function insertStoryAtDropTarget<T extends { id: string }>(
  stories: T[],
  activeStory: T,
  overId: string,
): T[] {
  const withoutActive = stories.filter((story) => story.id !== activeStory.id);
  const overIndex = withoutActive.findIndex((story) => story.id === overId);
  const insertionIndex = overIndex >= 0 ? overIndex : 0;
  const reordered = [...withoutActive];
  reordered.splice(insertionIndex, 0, activeStory);
  return reordered;
}

export function reindexStoriesPosition<T extends { position: number }>(
  stories: T[],
): T[] {
  return stories.map((story, index) => {
    const nextPosition = index + 1;
    if (story.position === nextPosition) {
      return story;
    }
    return { ...story, position: nextPosition };
  });
}
