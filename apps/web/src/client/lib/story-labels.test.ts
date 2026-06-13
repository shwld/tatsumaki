import { describe, expect, it } from "vitest";
import { parseCommaSeparated } from "./story-labels";

describe("parseCommaSeparated", () => {
  it("splits comma-separated values and trims whitespace", () => {
    expect(parseCommaSeparated("a, b , c")).toEqual(["a", "b", "c"]);
  });

  it("filters out empty strings", () => {
    expect(parseCommaSeparated(",a,,b,")).toEqual(["a", "b"]);
  });

  it("returns empty array for empty input", () => {
    expect(parseCommaSeparated("")).toEqual([]);
  });
});
