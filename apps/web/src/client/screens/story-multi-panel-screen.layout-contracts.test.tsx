import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetProjectStoryBreadcrumbCacheForTests } from "../components/project-story-breadcrumb";
import { createStoryMultiPanelFetchMock } from "../test/story-multi-panel/fetch-mock-builder";
import { renderStoryMultiPanel } from "../test/story-multi-panel/render-harness";

describe("StoryMultiPanelScreen layout contracts", () => {
  beforeEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    localStorage.clear();
  });

  afterEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    localStorage.clear();
    vi.unstubAllGlobals();
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new Event("resize"));
  });

  it("shows tab navigation on small screens", async () => {
    vi.stubGlobal("fetch", createStoryMultiPanelFetchMock());
    Object.defineProperty(window, "innerWidth", {
      value: 500,
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new Event("resize"));

    renderStoryMultiPanel();

    expect(await screen.findByTestId("panel-tabs")).toBeInTheDocument();
    expect(screen.getByTestId("panel-tab-Current")).toBeInTheDocument();
    expect(screen.getByTestId("panel-tab-Backlog")).toBeInTheDocument();
    expect(
      screen.getByTestId("mobile-sub-header-menu-toggle"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Project History")).not.toBeInTheDocument();
  });

  it("keeps local panel scroll constraints", async () => {
    vi.stubGlobal("fetch", createStoryMultiPanelFetchMock());
    renderStoryMultiPanel();

    expect(await screen.findByText("Backlog story")).toBeInTheDocument();

    const multiPanel = screen.getByTestId("multi-panel-layout");
    expect(multiPanel.className).toContain("min-h-0");
    expect(screen.getByTestId("panel-container").className).toContain(
      "min-h-0",
    );
    expect(screen.getByTestId("panel-Current").className).toContain("min-h-0");
    expect(screen.getByTestId("panel-scroll-Current").className).toContain(
      "overflow-y-auto",
    );
  });
});
