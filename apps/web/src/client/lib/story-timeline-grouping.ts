import type { StoryTimelineEntry } from "../types/story";

export type StoryTimelineDateGroup = {
  /** Local calendar day YYYY-MM-DD */
  dateKey: string;
  dateLabel: string;
  entries: StoryTimelineEntry[];
};

function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(dateKey: string): string {
  const [y, mo, da] = dateKey.split("-").map(Number);
  const d = new Date(y, mo - 1, da);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/**
 * Groups timeline entries by local post date while preserving ascending time order.
 */
export function groupStoryTimelineEntriesByPostDate(
  entries: StoryTimelineEntry[],
): StoryTimelineDateGroup[] {
  const groups: StoryTimelineDateGroup[] = [];
  for (const entry of entries) {
    const dateKey = toLocalDateKey(entry.createdAt);
    const last = groups.at(-1);
    if (last && last.dateKey === dateKey) {
      last.entries.push(entry);
      continue;
    }
    groups.push({
      dateKey,
      dateLabel: formatDateLabel(dateKey),
      entries: [entry],
    });
  }
  return groups;
}
