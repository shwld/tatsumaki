import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/me")) {
          return new Response(
            JSON.stringify({ id: "u1", displayName: "User" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
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
});
