import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { usePanelStoriesQuery } from "./use-panel-stories-query";
import type { Story } from "../types/story";

const PROJECT_ID = "project-1";
const CURRENT_ITERATION_ID = "iter-current";

const BASE_STORIES: Story[] = [
  {
    __typename: "Story",
    id: "story-unstarted",
    storyNumber: 1,
    projectId: PROJECT_ID,
    title: "Backlog story",
    description: "has search needle",
    type: "feature",
    status: "Unstarted",
    statusChangedAt: "2026-01-01T00:00:00.000Z",
    storyPoint: 3,
    labels: ["priority:high"],
    iterationId: null,
    isIcebox: false,
    ownerIds: [],
    requesterId: null,
    releaseDate: null,
    position: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    __typename: "Story",
    id: "story-started",
    storyNumber: 1,
    projectId: PROJECT_ID,
    title: "Current story",
    description: "Current story",
    type: "bug",
    status: "Started",
    statusChangedAt: "2026-01-01T00:00:00.000Z",
    storyPoint: 2,
    labels: ["backend"],
    iterationId: CURRENT_ITERATION_ID,
    isIcebox: false,
    ownerIds: [],
    requesterId: null,
    releaseDate: null,
    position: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    __typename: "Story",
    id: "story-accepted",
    storyNumber: 1,
    projectId: PROJECT_ID,
    title: "Done story",
    description: "Done work",
    type: "chore",
    status: "Accepted",
    statusChangedAt: "2026-01-01T00:00:00.000Z",
    storyPoint: 5,
    labels: ["done-tag"],
    iterationId: null,
    isIcebox: false,
    ownerIds: [],
    requesterId: null,
    releaseDate: null,
    position: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function createHookWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

function createStoriesFetchMock() {
  const stories = structuredClone(BASE_STORIES) as Story[];
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    const parsed = new URL(url, "http://localhost");

    if (url.startsWith(`/api/projects/${PROJECT_ID}/stories?`)) {
      const statuses = parsed.searchParams.get("statuses")?.split(",");
      const iterId = parsed.searchParams.get("iterationId");
      const excludeIterId = parsed.searchParams.get("excludeIterationId");
      const isIceboxRaw = parsed.searchParams.get("isIcebox");

      let matched = stories;
      if (statuses) {
        matched = matched.filter((story) => statuses.includes(story.status));
      }
      if (iterId) {
        matched = matched.filter((story) => story.iterationId === iterId);
      }
      if (excludeIterId) {
        matched = matched.filter(
          (story) =>
            story.iterationId === null || story.iterationId !== excludeIterId,
        );
      }
      if (isIceboxRaw === "true") {
        matched = matched.filter((story) => story.isIcebox);
      } else if (isIceboxRaw === "false") {
        matched = matched.filter((story) => !story.isIcebox);
      }
      return new Response(JSON.stringify({ stories: matched }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  });
  return fetchMock;
}

describe("usePanelStoriesQuery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps panel story references stable when data is unchanged", async () => {
    vi.stubGlobal("fetch", createStoriesFetchMock());

    const { result, rerender } = renderHook(
      () =>
        usePanelStoriesQuery({
          projectId: PROJECT_ID,
          currentIterationId: CURRENT_ITERATION_ID,
          filters: {
            searchQuery: "",
            activeOwner: null,
            activeLabel: null,
            showMyWorkOnly: false,
            activeTypeFilter: "all",
            activeOwners: [],
            activeLabels: [],
            activeEpicIds: [],
            activeTypes: [],
          },
          enabled: true,
        }),
      { wrapper: createHookWrapper() },
    );

    await waitFor(() => {
      expect(result.current.panels.Backlog.stories).toHaveLength(1);
      expect(result.current.panels.Current.stories).toHaveLength(1);
      expect(result.current.panels.Done.stories).toHaveLength(1);
    });

    const doneStoriesRef = result.current.panels.Done.stories;
    const currentStoriesRef = result.current.panels.Current.stories;
    const backlogStoriesRef = result.current.panels.Backlog.stories;

    rerender();

    expect(result.current.panels.Done.stories).toBe(doneStoriesRef);
    expect(result.current.panels.Current.stories).toBe(currentStoriesRef);
    expect(result.current.panels.Backlog.stories).toBe(backlogStoriesRef);
  });

  it("queries Current with separate ordering for unaccepted and accepted stories", async () => {
    const fetchMock = createStoriesFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () =>
        usePanelStoriesQuery({
          projectId: PROJECT_ID,
          currentIterationId: CURRENT_ITERATION_ID,
          filters: {
            searchQuery: "",
            activeOwner: null,
            activeLabel: null,
            showMyWorkOnly: false,
            activeTypeFilter: "all",
            activeOwners: [],
            activeLabels: [],
            activeEpicIds: [],
            activeTypes: [],
          },
          enabled: true,
        }),
      { wrapper: createHookWrapper() },
    );

    await waitFor(() => {
      expect(result.current.panels.Current.stories.length).toBeGreaterThan(0);
    });

    const currentQueryUrl = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .find((url) => {
        const parsed = new URL(url, "http://localhost");
        return (
          parsed.searchParams.get("iterationId") === CURRENT_ITERATION_ID &&
          parsed.searchParams.get("statuses") ===
            "Unstarted,Rejected,Started,Finished,Delivered"
        );
      });
    expect(currentQueryUrl).toBeDefined();
    const currentParsed = new URL(
      currentQueryUrl as string,
      "http://localhost",
    );
    expect(currentParsed.searchParams.get("order")).toBe("positionAsc");

    const currentAcceptedQueryUrl = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .find((url) => {
        const parsed = new URL(url, "http://localhost");
        return (
          parsed.searchParams.get("iterationId") === CURRENT_ITERATION_ID &&
          parsed.searchParams.get("statuses") === "Accepted"
        );
      });
    expect(currentAcceptedQueryUrl).toBeDefined();
    const acceptedParsed = new URL(
      currentAcceptedQueryUrl as string,
      "http://localhost",
    );
    expect(acceptedParsed.searchParams.get("order")).toBe(
      "statusChangedAtDesc",
    );
  });

  it("uses explicit positionAsc ordering for Backlog panel query", async () => {
    const fetchMock = createStoriesFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () =>
        usePanelStoriesQuery({
          projectId: PROJECT_ID,
          currentIterationId: CURRENT_ITERATION_ID,
          filters: {
            searchQuery: "",
            activeOwner: null,
            activeLabel: null,
            showMyWorkOnly: false,
            activeTypeFilter: "all",
            activeOwners: [],
            activeLabels: [],
            activeEpicIds: [],
            activeTypes: [],
          },
          enabled: true,
        }),
      { wrapper: createHookWrapper() },
    );

    await waitFor(() => {
      expect(result.current.panels.Backlog.stories.length).toBeGreaterThan(0);
    });

    const backlogQueryUrl = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .find((url) => {
        const parsed = new URL(url, "http://localhost");
        return parsed.searchParams.get("statuses") === "Unstarted,Rejected";
      });
    expect(backlogQueryUrl).toBeDefined();
    const parsed = new URL(backlogQueryUrl as string, "http://localhost");
    expect(parsed.searchParams.get("order")).toBe("positionAsc");
  });

  it("includes Unstarted stories assigned to current iteration in Current panel query", async () => {
    const currentUnstartedStory: Story = {
      ...BASE_STORIES[0],
      id: "story-current-unstarted",
      status: "Unstarted",
      iterationId: CURRENT_ITERATION_ID,
      title: "Current iteration unstarted",
    };
    const stories = [...BASE_STORIES, currentUnstartedStory];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        const parsed = new URL(url, "http://localhost");

        if (url.startsWith(`/api/projects/${PROJECT_ID}/stories?`)) {
          const statuses = parsed.searchParams.get("statuses")?.split(",");
          const iterId = parsed.searchParams.get("iterationId");
          const isIceboxRaw = parsed.searchParams.get("isIcebox");
          const excludeIterId = parsed.searchParams.get("excludeIterationId");

          let matched = stories;
          if (statuses) {
            matched = matched.filter((story) =>
              statuses.includes(story.status),
            );
          }
          if (iterId) {
            matched = matched.filter((story) => story.iterationId === iterId);
          }
          if (excludeIterId) {
            matched = matched.filter(
              (story) =>
                story.iterationId === null ||
                story.iterationId !== excludeIterId,
            );
          }
          if (isIceboxRaw === "true") {
            matched = matched.filter((story) => story.isIcebox);
          } else if (isIceboxRaw === "false") {
            matched = matched.filter((story) => !story.isIcebox);
          }

          return new Response(JSON.stringify({ stories: matched }), {
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

    const { result } = renderHook(
      () =>
        usePanelStoriesQuery({
          projectId: PROJECT_ID,
          currentIterationId: CURRENT_ITERATION_ID,
          filters: {
            searchQuery: "",
            activeOwner: null,
            activeLabel: null,
            showMyWorkOnly: false,
            activeTypeFilter: "all",
            activeOwners: [],
            activeLabels: [],
            activeEpicIds: [],
            activeTypes: [],
          },
          enabled: true,
        }),
      { wrapper: createHookWrapper() },
    );

    await waitFor(() => {
      expect(
        result.current.panels.Current.stories.some(
          (story) => story.id === currentUnstartedStory.id,
        ),
      ).toBe(true);
    });
  });

  it("keeps Accepted stories in current iteration inside Current and excludes them from Done", async () => {
    const acceptedCurrent: Story = {
      ...BASE_STORIES[2],
      id: "story-accepted-current",
      iterationId: CURRENT_ITERATION_ID,
      title: "Accepted in current",
    };
    const acceptedPast: Story = {
      ...BASE_STORIES[2],
      id: "story-accepted-past",
      iterationId: "iter-past",
      title: "Accepted in past",
    };
    const stories = [acceptedCurrent, acceptedPast];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        const parsed = new URL(url, "http://localhost");
        if (!url.startsWith(`/api/projects/${PROJECT_ID}/stories?`)) {
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        const statuses = parsed.searchParams.get("statuses")?.split(",");
        const iterId = parsed.searchParams.get("iterationId");
        const isIceboxRaw = parsed.searchParams.get("isIcebox");
        const iterationDateScope =
          parsed.searchParams.get("iterationDateScope");
        const includeUnassignedIteration =
          parsed.searchParams.get("includeUnassignedIteration") === "true";

        let matched = stories;
        if (statuses) {
          matched = matched.filter((story) => statuses.includes(story.status));
        }
        if (iterId) {
          matched = matched.filter((story) => story.iterationId === iterId);
        }
        if (isIceboxRaw === "true") {
          matched = matched.filter((story) => story.isIcebox);
        } else if (isIceboxRaw === "false") {
          matched = matched.filter((story) => !story.isIcebox);
        }
        if (iterationDateScope === "past") {
          matched = matched.filter(
            (story) =>
              story.iterationId === "iter-past" ||
              (includeUnassignedIteration && story.iterationId === null),
          );
        }

        return new Response(JSON.stringify({ stories: matched }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const { result } = renderHook(
      () =>
        usePanelStoriesQuery({
          projectId: PROJECT_ID,
          currentIterationId: CURRENT_ITERATION_ID,
          filters: {
            searchQuery: "",
            activeOwner: null,
            activeLabel: null,
            showMyWorkOnly: false,
            activeTypeFilter: "all",
            activeOwners: [],
            activeLabels: [],
            activeEpicIds: [],
            activeTypes: [],
          },
          enabled: true,
        }),
      { wrapper: createHookWrapper() },
    );

    await waitFor(() => {
      expect(
        result.current.panels.Current.stories.some(
          (story) => story.id === acceptedCurrent.id,
        ),
      ).toBe(true);
      expect(
        result.current.panels.Done.stories.some(
          (story) => story.id === acceptedCurrent.id,
        ),
      ).toBe(false);
      expect(
        result.current.panels.Done.stories.some(
          (story) => story.id === acceptedPast.id,
        ),
      ).toBe(true);
    });
  });

  it("updates only affected panels when applying story update", async () => {
    vi.stubGlobal("fetch", createStoriesFetchMock());

    const { result } = renderHook(
      () =>
        usePanelStoriesQuery({
          projectId: PROJECT_ID,
          currentIterationId: CURRENT_ITERATION_ID,
          filters: {
            searchQuery: "",
            activeOwner: null,
            activeLabel: null,
            showMyWorkOnly: false,
            activeTypeFilter: "all",
            activeOwners: [],
            activeLabels: [],
            activeEpicIds: [],
            activeTypes: [],
          },
          enabled: true,
        }),
      { wrapper: createHookWrapper() },
    );

    await waitFor(() => {
      expect(result.current.panels.Backlog.stories).toHaveLength(1);
      expect(result.current.panels.Current.stories).toHaveLength(1);
      expect(result.current.panels.Done.stories).toHaveLength(1);
    });

    const doneStoriesRef = result.current.panels.Done.stories;

    const movedStory: Story = {
      ...result.current.panels.Backlog.stories[0],
      status: "Started",
      iterationId: CURRENT_ITERATION_ID,
    };

    act(() => {
      result.current.applyStoryUpdate(movedStory);
    });

    await waitFor(() => {
      expect(
        result.current.panels.Backlog.stories.some(
          (s) => s.id === movedStory.id,
        ),
      ).toBe(false);
      expect(
        result.current.panels.Current.stories.some(
          (s) => s.id === movedStory.id,
        ),
      ).toBe(true);
    });
    expect(result.current.panels.Done.stories).toBe(doneStoriesRef);
  });

  it("keeps non-accepted Current stories in manual order", async () => {
    vi.stubGlobal("fetch", createStoriesFetchMock());

    const { result } = renderHook(
      () =>
        usePanelStoriesQuery({
          projectId: PROJECT_ID,
          currentIterationId: CURRENT_ITERATION_ID,
          filters: {
            searchQuery: "",
            activeOwner: null,
            activeLabel: null,
            showMyWorkOnly: false,
            activeTypeFilter: "all",
            activeOwners: [],
            activeLabels: [],
            activeEpicIds: [],
            activeTypes: [],
          },
          enabled: true,
        }),
      { wrapper: createHookWrapper() },
    );

    await waitFor(() => {
      expect(result.current.panels.Current.stories).toHaveLength(1);
    });

    const baseCurrent = result.current.panels.Current.stories[0];
    const extraLow: Story = {
      ...baseCurrent,
      id: "story-started-low",
      title: "Started low",
      status: "Started",
      position: 1,
      statusChangedAt: "2026-01-01T00:00:00.000Z",
    };
    const extraHigh: Story = {
      ...baseCurrent,
      id: "story-started-high",
      title: "Started high",
      status: "Started",
      position: 3,
      statusChangedAt: "2026-01-01T00:00:00.000Z",
    };
    act(() => {
      result.current.applyStoryUpdate(extraLow);
      result.current.applyStoryUpdate(extraHigh);
    });

    await waitFor(() => {
      const currentStories = result.current.panels.Current.stories;
      expect(currentStories.map((story) => story.id)).toEqual([
        "story-started-low",
        "story-started",
        "story-started-high",
      ]);
    });
  });

  it("keeps accepted Current stories in accepted-at ascending order", async () => {
    vi.stubGlobal("fetch", createStoriesFetchMock());

    const { result } = renderHook(
      () =>
        usePanelStoriesQuery({
          projectId: PROJECT_ID,
          currentIterationId: CURRENT_ITERATION_ID,
          filters: {
            searchQuery: "",
            activeOwner: null,
            activeLabel: null,
            showMyWorkOnly: false,
            activeTypeFilter: "all",
            activeOwners: [],
            activeLabels: [],
            activeEpicIds: [],
            activeTypes: [],
          },
          enabled: true,
        }),
      { wrapper: createHookWrapper() },
    );

    await waitFor(() => {
      expect(result.current.panels.Current.stories).toHaveLength(1);
    });

    const baseCurrent = result.current.panels.Current.stories[0];
    const acceptedHigh: Story = {
      ...baseCurrent,
      id: "story-accepted-high",
      title: "Accepted high",
      status: "Accepted",
      iterationId: CURRENT_ITERATION_ID,
      position: 10,
      statusChangedAt: "2026-12-31T00:00:00.000Z",
    };
    const acceptedLow: Story = {
      ...baseCurrent,
      id: "story-accepted-low",
      title: "Accepted low",
      status: "Accepted",
      iterationId: CURRENT_ITERATION_ID,
      position: 1,
      statusChangedAt: "2026-01-01T00:00:00.000Z",
    };

    act(() => {
      result.current.applyStoryUpdate(acceptedHigh);
      result.current.applyStoryUpdate(acceptedLow);
    });

    await waitFor(() => {
      expect(
        result.current.currentAccepted.stories.map((story) => story.id),
      ).toEqual(["story-accepted-low", "story-accepted-high"]);
      expect(
        result.current.panels.Current.stories.map((story) => story.id),
      ).toEqual(["story-accepted-low", "story-accepted-high", "story-started"]);
    });
  });

  it("prepends next accepted page after normalizing each page to ascending", async () => {
    const acceptedDesc: Story[] = Array.from({ length: 6 }, (_, index) => {
      const order = 6 - index;
      return {
        ...BASE_STORIES[2],
        id: `story-accepted-${order}`,
        title: `Accepted ${order}`,
        status: "Accepted",
        iterationId: CURRENT_ITERATION_ID,
        statusChangedAt: `2026-01-${String(order).padStart(2, "0")}T00:00:00.000Z`,
      };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        const parsed = new URL(url, "http://localhost");
        if (!url.startsWith(`/api/projects/${PROJECT_ID}/stories?`)) {
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        const statuses = parsed.searchParams.get("statuses")?.split(",") ?? [];
        const iterationId = parsed.searchParams.get("iterationId");
        const limit = Number(parsed.searchParams.get("limit") ?? "20");
        const offset = Number(parsed.searchParams.get("offset") ?? "0");

        if (statuses.length === 1 && statuses[0] === "Accepted") {
          const filtered = acceptedDesc.filter(
            (story) => story.iterationId === iterationId,
          );
          const page = filtered.slice(offset, offset + limit);
          const hasNext = offset + limit < filtered.length;
          return new Response(
            JSON.stringify({
              stories: page,
              pagination: {
                hasNext,
                nextOffset: hasNext ? offset + limit : null,
                limit,
                offset,
                total: filtered.length,
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }

        if (statuses.includes("Started")) {
          return new Response(
            JSON.stringify({
              stories: [BASE_STORIES[1]],
              pagination: {
                hasNext: false,
                nextOffset: null,
                limit,
                offset,
                total: 1,
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            stories: [],
            pagination: {
              hasNext: false,
              nextOffset: null,
              limit,
              offset,
              total: 0,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    const { result } = renderHook(
      () =>
        usePanelStoriesQuery({
          projectId: PROJECT_ID,
          currentIterationId: CURRENT_ITERATION_ID,
          filters: {
            searchQuery: "",
            activeOwner: null,
            activeLabel: null,
            showMyWorkOnly: false,
            activeTypeFilter: "all",
            activeOwners: [],
            activeLabels: [],
            activeEpicIds: [],
            activeTypes: [],
          },
          enabled: true,
        }),
      { wrapper: createHookWrapper() },
    );

    await waitFor(() => {
      expect(
        result.current.currentAccepted.stories.map((story) => story.id),
      ).toEqual(["story-accepted-4", "story-accepted-5", "story-accepted-6"]);
    });

    await act(async () => {
      await result.current.currentAccepted.fetchNextPage();
    });

    await waitFor(() => {
      expect(
        result.current.currentAccepted.stories.map((story) => story.id),
      ).toEqual([
        "story-accepted-1",
        "story-accepted-2",
        "story-accepted-3",
        "story-accepted-4",
        "story-accepted-5",
        "story-accepted-6",
      ]);
    });
  });

  it("stores current accepted stories separately", async () => {
    const acceptedCurrent: Story = {
      ...BASE_STORIES[2],
      id: "story-accepted-current",
      iterationId: CURRENT_ITERATION_ID,
      title: "Accepted in current",
    };
    const stories = [BASE_STORIES[1], acceptedCurrent];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        const parsed = new URL(url, "http://localhost");
        if (!url.startsWith(`/api/projects/${PROJECT_ID}/stories?`)) {
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        const statuses = parsed.searchParams.get("statuses")?.split(",") ?? [];
        const iterationId = parsed.searchParams.get("iterationId");
        const matched = stories.filter((story) => {
          if (iterationId && story.iterationId !== iterationId) return false;
          return statuses.includes(story.status);
        });
        return new Response(JSON.stringify({ stories: matched }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const { result } = renderHook(
      () =>
        usePanelStoriesQuery({
          projectId: PROJECT_ID,
          currentIterationId: CURRENT_ITERATION_ID,
          filters: {
            searchQuery: "",
            activeOwner: null,
            activeLabel: null,
            showMyWorkOnly: false,
            activeTypeFilter: "all",
            activeOwners: [],
            activeLabels: [],
            activeEpicIds: [],
            activeTypes: [],
          },
          enabled: true,
        }),
      { wrapper: createHookWrapper() },
    );

    await waitFor(() => {
      expect(
        result.current.currentAccepted.stories.some(
          (story) => story.id === acceptedCurrent.id,
        ),
      ).toBe(true);
      expect(
        result.current.panels.Current.stories.some(
          (story) => story.id === acceptedCurrent.id,
        ),
      ).toBe(true);
    });
  });

  it("keeps current-iteration stories in Current after reverting status to Unstarted", async () => {
    vi.stubGlobal("fetch", createStoriesFetchMock());

    const { result } = renderHook(
      () =>
        usePanelStoriesQuery({
          projectId: PROJECT_ID,
          currentIterationId: CURRENT_ITERATION_ID,
          filters: {
            searchQuery: "",
            activeOwner: null,
            activeLabel: null,
            showMyWorkOnly: false,
            activeTypeFilter: "all",
            activeOwners: [],
            activeLabels: [],
            activeEpicIds: [],
            activeTypes: [],
          },
          enabled: true,
        }),
      { wrapper: createHookWrapper() },
    );

    await waitFor(() => {
      expect(result.current.panels.Current.stories).toHaveLength(1);
    });

    const currentStory = result.current.panels.Current.stories[0];

    act(() => {
      result.current.applyStoryUpdate({
        ...currentStory,
        status: "Unstarted",
      });
    });

    await waitFor(() => {
      expect(
        result.current.panels.Current.stories.some(
          (story) =>
            story.id === currentStory.id && story.status === "Unstarted",
        ),
      ).toBe(true);
      expect(
        result.current.panels.Backlog.stories.some(
          (story) => story.id === currentStory.id,
        ),
      ).toBe(false);
    });
  });

  it("does not append unseen stories when syncing existing panel rows", async () => {
    vi.stubGlobal("fetch", createStoriesFetchMock());

    const { result } = renderHook(
      () =>
        usePanelStoriesQuery({
          projectId: PROJECT_ID,
          currentIterationId: CURRENT_ITERATION_ID,
          filters: {
            searchQuery: "",
            activeOwner: null,
            activeLabel: null,
            showMyWorkOnly: false,
            activeTypeFilter: "all",
            activeOwners: [],
            activeLabels: [],
            activeEpicIds: [],
            activeTypes: [],
          },
          enabled: true,
        }),
      { wrapper: createHookWrapper() },
    );

    await waitFor(() => {
      expect(result.current.panels.Backlog.stories).toHaveLength(1);
    });

    const originalBacklog = result.current.panels.Backlog.stories;
    const knownStory = originalBacklog[0];
    const unseenStory: Story = {
      ...knownStory,
      id: "story-unseen",
      title: "Unseen Story",
      position: 99,
    };
    const knownUpdated: Story = {
      ...knownStory,
      title: "Backlog story updated",
    };

    act(() => {
      result.current.applyExistingStoriesInPanel("Backlog", [
        knownUpdated,
        unseenStory,
      ]);
    });

    await waitFor(() => {
      expect(result.current.panels.Backlog.stories).toHaveLength(1);
      expect(result.current.panels.Backlog.stories[0].id).toBe(knownStory.id);
      expect(result.current.panels.Backlog.stories[0].title).toBe(
        "Backlog story updated",
      );
    });
  });

  it("preserves caller order for optimistic panel replacement", async () => {
    vi.stubGlobal("fetch", createStoriesFetchMock());

    const { result } = renderHook(
      () =>
        usePanelStoriesQuery({
          projectId: PROJECT_ID,
          currentIterationId: CURRENT_ITERATION_ID,
          filters: {
            searchQuery: "",
            activeOwner: null,
            activeLabel: null,
            showMyWorkOnly: false,
            activeTypeFilter: "all",
            activeOwners: [],
            activeLabels: [],
            activeEpicIds: [],
            activeTypes: [],
          },
          enabled: true,
        }),
      { wrapper: createHookWrapper() },
    );

    await waitFor(() => {
      expect(result.current.panels.Current.stories).toHaveLength(1);
      expect(result.current.panels.Backlog.stories).toHaveLength(1);
    });

    const backlogStory = result.current.panels.Backlog.stories[0];
    const currentStory = result.current.panels.Current.stories[0];
    const optimisticOrder = [
      { ...currentStory, position: 2 },
      { ...backlogStory, position: 1 },
    ];

    act(() => {
      result.current.replacePanelStories("Current", optimisticOrder);
    });

    await waitFor(() => {
      expect(result.current.panels.Current.stories.map((s) => s.id)).toEqual([
        currentStory.id,
        backlogStory.id,
      ]);
    });
  });
});
