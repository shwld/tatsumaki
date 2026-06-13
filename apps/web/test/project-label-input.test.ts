import { describe, expect, it } from "vitest";
import {
  normalizeLabelColor,
  normalizeLabelName,
} from "../src/application/usecases/project-label-input";

describe("normalizeLabelName", () => {
  it("trims whitespace", () => {
    const result = normalizeLabelName("  backend  ");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe("backend");
  });

  it("rejects empty string", () => {
    const result = normalizeLabelName("");
    expect(result.isErr()).toBe(true);
  });

  it("rejects whitespace-only string", () => {
    const result = normalizeLabelName("   ");
    expect(result.isErr()).toBe(true);
  });

  it("rejects string longer than 50 characters", () => {
    const result = normalizeLabelName("a".repeat(51));
    expect(result.isErr()).toBe(true);
  });

  it("accepts 50-character string", () => {
    const name = "a".repeat(50);
    const result = normalizeLabelName(name);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(name);
  });
});

describe("normalizeLabelColor", () => {
  it("accepts valid hex color", () => {
    const result = normalizeLabelColor("#3b82f6");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe("#3b82f6");
  });

  it("lowercases hex color", () => {
    const result = normalizeLabelColor("#3B82F6");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe("#3b82f6");
  });

  it("trims whitespace", () => {
    const result = normalizeLabelColor("  #3b82f6  ");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe("#3b82f6");
  });

  it("rejects invalid format", () => {
    expect(normalizeLabelColor("not-a-color").isErr()).toBe(true);
    expect(normalizeLabelColor("#fff").isErr()).toBe(true);
    expect(normalizeLabelColor("3b82f6").isErr()).toBe(true);
    expect(normalizeLabelColor("#3b82f6g").isErr()).toBe(true);
  });
});
