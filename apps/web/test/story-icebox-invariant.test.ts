import { describe, expect, it } from "vitest";
import {
  INVALID_STORY_IS_ICEBOX_ERROR,
  resolveStoryIsIcebox,
} from "../src/domain/entities/story";

describe("resolveStoryIsIcebox (isIcebox => Unstarted without iteration)", () => {
  const icebox = { isIcebox: true, iterationId: null };
  const backlog = { isIcebox: false, iterationId: null };

  it("allows an explicit isIcebox=true for an unscheduled Unstarted story", () => {
    expect(
      resolveStoryIsIcebox({
        requested: true,
        current: backlog,
        nextStatus: "Unstarted",
      })._unsafeUnwrap(),
    ).toBe(true);
  });

  it.each([
    "Started",
    "Finished",
    "Delivered",
    "Rejected",
    "Accepted",
  ])("rejects an explicit isIcebox=true when the resulting status is %s", (nextStatus) => {
    expect(
      resolveStoryIsIcebox({
        requested: true,
        current: backlog,
        nextStatus,
      })._unsafeUnwrapErr(),
    ).toBe(INVALID_STORY_IS_ICEBOX_ERROR);
  });

  it("rejects an explicit isIcebox=true for a story with an iteration", () => {
    expect(
      resolveStoryIsIcebox({
        requested: true,
        current: { isIcebox: false, iterationId: "iter-1" },
        nextStatus: "Unstarted",
      })._unsafeUnwrapErr(),
    ).toBe(INVALID_STORY_IS_ICEBOX_ERROR);
  });

  it("allows an explicit isIcebox=false regardless of status", () => {
    expect(
      resolveStoryIsIcebox({
        requested: false,
        current: { isIcebox: true, iterationId: null },
        nextStatus: "Started",
      })._unsafeUnwrap(),
    ).toBe(false);
  });

  it.each([
    "Started",
    "Finished",
    "Delivered",
    "Rejected",
    "Accepted",
  ])("takes an Icebox story out of the Icebox when its status becomes %s", (nextStatus) => {
    expect(
      resolveStoryIsIcebox({
        requested: undefined,
        current: icebox,
        nextStatus,
      })._unsafeUnwrap(),
    ).toBe(false);
  });

  it("keeps an Icebox story in the Icebox while it stays Unstarted", () => {
    expect(
      resolveStoryIsIcebox({
        requested: undefined,
        current: icebox,
        nextStatus: "Unstarted",
      })._unsafeUnwrap(),
    ).toBeUndefined();
  });

  it("leaves a non-Icebox story untouched", () => {
    expect(
      resolveStoryIsIcebox({
        requested: undefined,
        current: backlog,
        nextStatus: "Started",
      })._unsafeUnwrap(),
    ).toBeUndefined();
  });

  it("validates creation: Unstarted Icebox is allowed, others are rejected", () => {
    expect(
      resolveStoryIsIcebox({
        requested: true,
        current: null,
        nextStatus: "Unstarted",
      })._unsafeUnwrap(),
    ).toBe(true);
    expect(
      resolveStoryIsIcebox({
        requested: true,
        current: null,
        nextStatus: "Started",
      })._unsafeUnwrapErr(),
    ).toBe(INVALID_STORY_IS_ICEBOX_ERROR);
  });
});
