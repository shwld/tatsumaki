import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { i18n } from "../i18n/config";
import type { Story } from "../types/story";

vi.mock("../components/story-accordion-detail", () => ({
  StoryAccordionDetail: ({ story }: { story: Story }) => (
    <div data-testid="story-accordion-detail">{story.title}</div>
  ),
}));

function createStory(overrides: Partial<Story> = {}): Story {
  return {
    __typename: "Story",
    id: "story-1",
    storyNumber: 1,
    projectId: "project-1",
    title: "Sample story",
    description: "Description",
    type: "feature",
    status: "Started",
    statusChangedAt: "2026-01-01T00:00:00.000Z",
    storyPoint: 2,
    labels: [],
    iterationId: null,
    isIcebox: false,
    ownerIds: [],
    requesterId: null,
    releaseDate: null,
    position: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("App story detail route", () => {
  beforeEach(() => {
    const secondProject = {
      id: "project-2",
      name: "Beta",
      description: "",
      isPublic: false,
      timezone: "Asia/Tokyo",
      sprintDurationDays: 14,
      iterationStartDay: 1,
      pointScaleType: "fibonacci",
      customPointScale: null,
      estimateBugs: false,
      estimateChores: false,
      currentUserRole: "owner",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/onboarding") {
          return new Response(
            JSON.stringify({
              completed: true,
              email: null,
              challenge: { kind: "disabled", siteKey: null },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/api/auth/me")) {
          return new Response(
            JSON.stringify({ id: "u1", displayName: "User" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url === "/api/projects") {
          return new Response(
            JSON.stringify({
              projects: [{ id: "project-1", name: "Alpha" }, secondProject],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url === "/api/projects/project-2") {
          return Response.json({ project: secondProject });
        }
        if (
          url === "/api/projects/project-2/settings" &&
          init?.method === "PATCH"
        ) {
          secondProject.name = JSON.parse(String(init.body)).name;
          return Response.json({ project: secondProject });
        }
        if (url.endsWith("/api/projects/project-1/stories/1")) {
          return new Response(JSON.stringify({ story: createStory() }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not redirect to /projects when directly opening /stories/:storyNumber", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/projects/project-1/stories/1"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("ストーリー詳細")).toBeInTheDocument();
    });
    expect(screen.queryByText("404 Not Found")).toBeNull();
    expect(screen.queryByText("ストーリー一覧")).toBeNull();
  });

  it("updates the tab title when switching or renaming projects and changing pages or language", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/projects/project-1/stories/1"]}>
          <Link to="/projects/project-2/planning-poker">Other project</Link>
          <Link to="/login">Sign in page</Link>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(document.title).toBe("[Alpha] | ストーリー詳細"),
    );

    await user.click(screen.getByRole("link", { name: "Other project" }));
    await waitFor(() =>
      expect(document.title).toBe("[Beta] | ページが見つかりません"),
    );

    await user.click(screen.getByRole("link", { name: "設定" }));
    const projectName = await screen.findByRole("textbox", {
      name: "プロジェクト名",
    });
    expect(document.title).toBe("[Beta] | プロジェクト設定");
    await user.clear(projectName);
    await user.type(projectName, "Renamed Beta{Enter}");
    await waitFor(() =>
      expect(document.title).toBe("[Renamed Beta] | プロジェクト設定"),
    );

    await user.click(screen.getByRole("link", { name: "Sign in page" }));
    expect(document.title).toBe("tatsumaki | ログイン");

    try {
      await act(() => i18n.changeLanguage("en"));
      expect(document.title).toBe("tatsumaki | Login");
    } finally {
      await act(() => i18n.changeLanguage("ja"));
    }
  });
});
