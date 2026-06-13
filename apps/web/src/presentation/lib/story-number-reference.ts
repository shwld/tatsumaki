const STORY_NUMBER_REFERENCE_PATTERN = /^#?(\d+)$/;

/** Parses UI-style story references such as `42` or `#42`. */
export function parseStoryNumberReference(raw: string): number | null {
  const matched = raw.trim().match(STORY_NUMBER_REFERENCE_PATTERN);
  if (!matched) {
    return null;
  }
  const storyNumber = Number(matched[1]);
  if (!Number.isSafeInteger(storyNumber) || storyNumber <= 0) {
    return null;
  }
  return storyNumber;
}
