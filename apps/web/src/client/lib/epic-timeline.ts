import type { Epic } from "../types/epic";

export const TIMELINE_MONTHS = 6;

export type MonthIndex = number;

export function monthIndexOf(date: string): MonthIndex {
  const [year, month] = date.split("-").map(Number);
  return (year ?? 0) * 12 + ((month ?? 1) - 1);
}

export function monthLabel(index: MonthIndex): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function daysInMonth(index: MonthIndex): number {
  const { year, month } = monthLabel(index);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function position(date: string, windowStart: MonthIndex, isEnd: boolean) {
  const index = monthIndexOf(date);
  const day = Number(date.split("-")[2] ?? 1);
  const fraction = (isEnd ? day : day - 1) / daysInMonth(index);
  return (index - windowStart + fraction) / TIMELINE_MONTHS;
}

export type TimelineBar = {
  leftPercent: number;
  widthPercent: number;
  clippedStart: boolean;
  clippedEnd: boolean;
};

export type TimelineLayout<T extends { epic: Epic }> = {
  unscheduled: T[];
  visible: Array<{ item: T; bar: TimelineBar }>;
  before: T[];
  after: T[];
};

export function layoutTimeline<T extends { epic: Epic }>(
  items: T[],
  windowStart: MonthIndex,
): TimelineLayout<T> {
  const windowEnd = windowStart + TIMELINE_MONTHS - 1;
  const layout: TimelineLayout<T> = {
    unscheduled: [],
    visible: [],
    before: [],
    after: [],
  };
  for (const item of items) {
    const { plannedStart, plannedEnd } = item.epic;
    if (!plannedStart || !plannedEnd) {
      layout.unscheduled.push(item);
      continue;
    }
    if (monthIndexOf(plannedEnd) < windowStart) {
      layout.before.push(item);
      continue;
    }
    if (monthIndexOf(plannedStart) > windowEnd) {
      layout.after.push(item);
      continue;
    }
    const left = Math.max(0, position(plannedStart, windowStart, false));
    const right = Math.min(1, position(plannedEnd, windowStart, true));
    layout.visible.push({
      item,
      bar: {
        leftPercent: left * 100,
        widthPercent: Math.max(right - left, 0.01) * 100,
        clippedStart: monthIndexOf(plannedStart) < windowStart,
        clippedEnd: monthIndexOf(plannedEnd) > windowEnd,
      },
    });
  }
  return layout;
}
