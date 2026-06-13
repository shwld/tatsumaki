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
