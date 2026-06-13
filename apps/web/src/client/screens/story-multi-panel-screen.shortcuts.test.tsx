import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetProjectStoryBreadcrumbCacheForTests } from "../components/project-story-breadcrumb";
import { createStoryMultiPanelFetchMock } from "../test/story-multi-panel/fetch-mock-builder";
import { renderStoryMultiPanel } from "../test/story-multi-panel/render-harness";

describe("StoryMultiPanelScreen shortcuts", () => {
  beforeEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    localStorage.clear();
  });

  afterEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("opens shortcut help with ? and closes with Escape", async () => {
    vi.stubGlobal("fetch", createStoryMultiPanelFetchMock());
    renderStoryMultiPanel();

    expect(await screen.findByText("Backlog story")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    expect(
      screen.getByRole("dialog", { name: "ショートカット一覧" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "ショートカット一覧" }),
      ).not.toBeInTheDocument();
    });
  });

  it("moves active selection with j/k", async () => {
    vi.stubGlobal("fetch", createStoryMultiPanelFetchMock());
    renderStoryMultiPanel();

    expect(await screen.findByText("Current story")).toBeInTheDocument();

    const currentCheckbox = screen.getByRole("checkbox", {
      name: "Current story を選択",
    }) as HTMLInputElement;
    const backlogCheckbox = screen.getByRole("checkbox", {
      name: "Backlog story を選択",
    }) as HTMLInputElement;

    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => {
      expect(backlogCheckbox.checked).toBe(true);
      expect(currentCheckbox.checked).toBe(false);
    });

    fireEvent.keyDown(window, { key: "k" });
    await waitFor(() => {
      expect(currentCheckbox.checked).toBe(true);
      expect(backlogCheckbox.checked).toBe(false);
    });
  });
});
