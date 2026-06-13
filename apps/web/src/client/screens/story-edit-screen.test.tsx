import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resetProjectStoryBreadcrumbCacheForTests } from "../components/project-story-breadcrumb";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ToastProvider } from "../contexts/toast-context";
import { StoryEditScreen } from "./story-edit-screen";
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

function createFetchMock() {
  const inner = vi.fn();
  const wrapper = vi.fn(
    async (...args: Parameters<typeof globalThis.fetch>) => {
      const url = String(args[0]);
      if (url.includes("/api/auth/me")) {
        return new Response(
          JSON.stringify({
            id: "github|test-user",
            displayName: "test-user",
            email: "test@example.com",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (
        url.match(/\/api\/projects\/[^/]+$/) &&
        !url.includes("/stories") &&
        !url.includes("/members") &&
        !url.includes("/labels")
      ) {
        return new Response(
          JSON.stringify({
            project: {
              id: "project-1",
              name: "Alpha Project",
              sprintDurationDays: 14,
              pointScaleType: "fibonacci",
              customPointScale: null,
              pointScale: [0, 1, 2, 3, 5, 8, 13],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return inner(...args);
    },
  );
  return { wrapper, inner };
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={["/projects/project-1/stories/story-1/edit"]}
      >
        <AuthErrorProvider>
          <ToastProvider>
            <Routes>
              <Route
                path="/projects/:projectId/stories/:storyNumber/edit"
                element={<StoryEditScreen />}
              />
            </Routes>
          </ToastProvider>
        </AuthErrorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StoryEditScreen", () => {
  let fetchInner: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    localStorage.clear();
    const { wrapper, inner } = createFetchMock();
    fetchInner = inner;
    vi.stubGlobal("fetch", wrapper);
  });

  afterEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("loads story and members then renders accordion detail", async () => {
    fetchInner.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/projects/project-1/stories/story-1")) {
        return new Response(JSON.stringify({ story: createStory() }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/projects/project-1/members")) {
        return new Response(
          JSON.stringify({ members: [{ userId: "github|a" }] }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.endsWith("/api/projects") || url === "/api/projects") {
        return new Response(
          JSON.stringify({
            projects: [
              {
                id: "project-1",
                name: "Alpha Project",
                sprintDurationDays: 14,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });

    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId("story-accordion-detail")).toHaveTextContent(
        "Sample story",
      );
    });
    expect(
      screen.getByRole("navigation", { name: "パンくず" }),
    ).toHaveTextContent("Projects/Alpha Project/ストーリーを編集");
  });

  it("shows error when story is not found", async () => {
    fetchInner.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/projects/project-1/stories/story-1")) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/members")) {
        return new Response(JSON.stringify({ members: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/api/projects") || url === "/api/projects") {
        return new Response(
          JSON.stringify({ projects: [{ id: "project-1", name: "P" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });

    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByText("ストーリーが見つかりません"),
      ).toBeInTheDocument();
    });
  });
});
