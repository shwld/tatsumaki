import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import {
  ProjectStoryBreadcrumb,
  resetProjectStoryBreadcrumbCacheForTests,
} from "./project-story-breadcrumb";
import { i18n } from "../i18n/config";

describe("ProjectStoryBreadcrumb", () => {
  beforeEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    vi.spyOn(globalThis, "fetch");
    void i18n.changeLanguage("ja");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders current page label and projects link", () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ projects: [] }), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <ProjectStoryBreadcrumb currentPageLabel="新規ストーリー" />
      </MemoryRouter>,
    );

    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "パンくず" }),
    ).toBeInTheDocument();
    expect(screen.getByText("新規ストーリー")).toBeInTheDocument();
  });

  it("fetches and displays project name", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          projects: [{ id: "p1", name: "My Project" }],
        }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter>
        <ProjectStoryBreadcrumb projectId="p1" currentPageLabel="編集" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("My Project")).toBeInTheDocument();
    });
  });

  it("shows default name when project not found", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ projects: [] }), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <ProjectStoryBreadcrumb projectId="missing" currentPageLabel="Page" />
      </MemoryRouter>,
    );

    // default name persists
    expect(screen.getByText("プロジェクト")).toBeInTheDocument();
  });

  it("renders fallback labels in English", async () => {
    await i18n.changeLanguage("en");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ projects: [] }), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <ProjectStoryBreadcrumb projectId="missing" currentPageLabel="Page" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });
});
