import { todayIso } from "../../shared/date/today-iso";
import type { Iteration } from "../types/iteration";

export function findCurrentIteration(
  iterations: Iteration[],
  now: Date = new Date(),
): Iteration | null {
  const today = todayIso(now);
  return (
    iterations.find((it) => it.startDate <= today && it.endDate > today) ?? null
  );
}
