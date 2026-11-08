import { describe, expect, it } from "vitest";

import type { Epic } from "../types/epic";
import { layoutTimeline, monthIndexOf } from "./epic-timeline";

const epic = (start: string | null, end: string | null) => ({
  epic: { plannedStart: start, plannedEnd: end } as Epic,
});

describe("layoutTimeline", () => {
  const windowStart = monthIndexOf("2026-10-01");

  it("separates unscheduled, outside-range and visible epics", () => {
    const layout = layoutTimeline(
      [
        epic(null, null),
        epic("2026-01-01", "2026-03-31"),
        epic("2027-06-01", "2027-07-31"),
        epic("2026-10-01", "2026-10-31"),
      ],
      windowStart,
    );
    expect(layout.unscheduled).toHaveLength(1);
    expect(layout.before).toHaveLength(1);
    expect(layout.after).toHaveLength(1);
    expect(layout.visible).toHaveLength(1);
  });

  it("places a one-month epic over exactly one of six columns", () => {
    const [entry] = layoutTimeline(
      [epic("2026-11-01", "2026-11-30")],
      windowStart,
    ).visible;
    expect(entry?.bar.leftPercent).toBeCloseTo(100 / 6);
    expect(entry?.bar.widthPercent).toBeCloseTo(100 / 6);
  });

  it("clips epics that extend past the window and marks them", () => {
    const [entry] = layoutTimeline(
      [epic("2026-08-01", "2027-06-30")],
      windowStart,
    ).visible;
    expect(entry?.bar).toMatchObject({
      leftPercent: 0,
      widthPercent: 100,
      clippedStart: true,
      clippedEnd: true,
    });
  });
});
