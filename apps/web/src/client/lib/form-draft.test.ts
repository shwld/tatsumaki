import { afterEach, describe, expect, it } from "vitest";
import { clearDraft, loadDraft, saveDraft } from "./form-draft";

describe("form-draft", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("saves and loads a draft", () => {
    saveDraft("test", { title: "hello", count: 42 });
    const draft = loadDraft("test");
    expect(draft).toEqual({ title: "hello", count: 42 });
  });

  it("returns null when no draft exists", () => {
    expect(loadDraft("nonexistent")).toBeNull();
  });

  it("clears a draft", () => {
    saveDraft("test", { title: "hello" });
    clearDraft("test");
    expect(loadDraft("test")).toBeNull();
  });

  it("returns null for corrupted data", () => {
    localStorage.setItem("tatsumaki:draft:bad", "not json{{{");
    expect(loadDraft("bad")).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    localStorage.setItem("tatsumaki:draft:arr", "[1,2,3]");
    expect(loadDraft("arr")).toBeNull();
  });
});
