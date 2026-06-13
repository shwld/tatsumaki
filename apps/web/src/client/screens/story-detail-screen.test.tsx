import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resetProjectStoryBreadcrumbCacheForTests } from "../components/project-story-breadcrumb";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { StoryDetailScreen } from "./story-detail-screen";
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
    storyNumber: overrides.storyNumber ?? 1,
  };
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/projects/project-1/stories/1"]}>
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/stories/:storyNumber"
              element={<StoryDetailScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StoryDetailScreen", () => {
  beforeEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/projects") {
          return new Response(
            JSON.stringify({ projects: [{ id: "project-1", name: "P" }] }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/api/auth/me")) {
          return new Response(
            JSON.stringify({ id: "u1", displayName: "User" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("renders story detail when story exists", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects") {
        return new Response(
          JSON.stringify({ projects: [{ id: "project-1", name: "P" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/api/projects/project-1/stories/1")) {
        return new Response(JSON.stringify({ story: createStory() }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId("story-accordion-detail")).toHaveTextContent(
        "Sample story",
      );
    });
  });

  it("shows not found when story does not exist", async () => {
    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByText("ストーリーが見つかりません"),
      ).toBeInTheDocument();
    });
  });
});
