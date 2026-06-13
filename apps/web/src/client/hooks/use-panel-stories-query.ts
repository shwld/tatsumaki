import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useMemo } from "react";
import {
  storyQueryKeys,
  type StoryPanelQueryFilters,
} from "./story-query-keys";
import { parseErrorMessage } from "../lib/parse-error-message";
import { projectStoriesApiPath } from "../lib/story-routes";
import type { PanelType } from "../lib/panel-visibility";
import type { StoriesResponse, Story, StoryStatus } from "../types/story";

const PANEL_PAGE_SIZES: Record<PanelType, number> = {
  Done: 10,
  Current: 20,
  Backlog: 20,
  Icebox: 20,
};
const CURRENT_ACCEPTED_PAGE_SIZE = 3;

const ALL_PANELS: PanelType[] = ["Done", "Current", "Backlog", "Icebox"];

const IN_PROGRESS_STATUSES: Set<StoryStatus> = new Set([
  "Started",
  "Finished",
  "Delivered",
]);
const CURRENT_ITERATION_STATUSES: Set<StoryStatus> = new Set([
  "Unstarted",
  "Rejected",
  "Started",
  "Finished",
  "Delivered",
  "Accepted",
]);

type PanelStoriesPage = {
  stories: Story[];
  pagination: StoriesResponse["pagination"];
};

type PanelStoriesData = InfiniteData<PanelStoriesPage, number>;
export type PanelRollbackSnapshot = Partial<
  Record<PanelType, PanelStoriesData | undefined>
> & {
  CurrentAccepted?: PanelStoriesData | undefined;
};

type PanelQueryState = {
  stories: Story[];
  total: number | null;
  totalPoints: number | null;
  pointsByIterationId: Record<string, number>;
  statusCode: number | null;
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  error: string | null;
  hasNextPage: boolean;
  fetchNextPage: () => Promise<void>;
  refetch: () => Promise<void>;
  queryKey: readonly unknown[];
};
type CurrentAcceptedQueryState = PanelQueryState;
type QueryError = Error & { status?: number };

type UsePanelStoriesQueryInput = {
  projectId: string | undefined;
  currentIterationId: string | null;
  filters: StoryPanelQueryFilters;
  enabled: boolean;
};

type PanelQueryMap = Record<PanelType, PanelQueryState>;

type InvalidatePanelsInput = {
  panels?: PanelType[];
  refetchType?: "active" | "inactive" | "all" | "none";
};
type PanelSelectionInput = {
  panels?: PanelType[];
};

function panelBaseQuery(
  panel: PanelType,
  currentIterationId: string | null,
  filters: StoryPanelQueryFilters,
): URLSearchParams {
  const query = new URLSearchParams();
  query.set("detail", "summary");
  const normalizedSearch = filters.searchQuery.trim();
  if (normalizedSearch) {
    query.set("q", normalizedSearch);
  }
  if (filters.activeOwners.length > 0) {
    query.set("owners", filters.activeOwners.join(","));
  }
  if (filters.activeLabels.length > 0) {
    query.set("labels", filters.activeLabels.join(","));
  }
  if (filters.activeEpicIds.length > 0) {
    query.set("epicIds", filters.activeEpicIds.join(","));
  }
  if (filters.activeTypes.length > 0) {
    query.set("types", filters.activeTypes.join(","));
  }

  if (panel === "Done") {
    query.set("statuses", "Accepted");
    query.set("order", "statusChangedAtDesc");
    query.set("iterationDateScope", "past");
    query.set("includeUnassignedIteration", "true");
  } else if (panel === "Current") {
    query.set(
      "statuses",
      currentIterationId
        ? "Unstarted,Rejected,Started,Finished,Delivered"
        : "Started,Finished,Delivered",
    );
    query.set("order", "positionAsc");
    if (currentIterationId) {
      query.set("iterationId", currentIterationId);
    }
    query.set("isIcebox", "false");
  } else if (panel === "Backlog") {
    query.set("statuses", "Unstarted,Rejected");
    query.set("isIcebox", "false");
    query.set("iterationDateScope", "future");
    query.set("includeUnassignedIteration", "true");
    query.set("order", "positionAsc");
  } else {
    query.set("isIcebox", "true");
    query.set("order", "positionAsc");
  }

  return query;
}

function currentAcceptedBaseQuery(
  currentIterationId: string,
  filters: StoryPanelQueryFilters,
): URLSearchParams {
  const query = new URLSearchParams();
  query.set("detail", "summary");
  const normalizedSearch = filters.searchQuery.trim();
  if (normalizedSearch) {
    query.set("q", normalizedSearch);
  }
  if (filters.activeOwners.length > 0) {
    query.set("owners", filters.activeOwners.join(","));
  }
  if (filters.activeLabels.length > 0) {
    query.set("labels", filters.activeLabels.join(","));
  }
  if (filters.activeEpicIds.length > 0) {
    query.set("epicIds", filters.activeEpicIds.join(","));
  }
  if (filters.activeTypes.length > 0) {
    query.set("types", filters.activeTypes.join(","));
  }
  query.set("statuses", "Accepted");
  query.set("iterationId", currentIterationId);
  query.set("isIcebox", "false");
  query.set("order", "statusChangedAtDesc");
  return query;
}

function storyMatchesPanel(
  story: Story,
  panel: PanelType,
  currentIterationId: string | null,
): boolean {
  if (panel === "Done") {
    if (story.status !== "Accepted") return false;
    if (currentIterationId && story.iterationId === currentIterationId) {
      return false;
    }
    return true;
  }
  if (panel === "Current") {
    if (story.isIcebox) return false;
    if (currentIterationId) {
      if (story.iterationId !== currentIterationId) return false;
      return CURRENT_ITERATION_STATUSES.has(story.status);
    }
    return IN_PROGRESS_STATUSES.has(story.status);
  }
  if (panel === "Backlog") {
    if (story.isIcebox) return false;
    if (story.status !== "Unstarted" && story.status !== "Rejected") {
      return false;
    }
    if (currentIterationId && story.iterationId === currentIterationId) {
      return false;
    }
    return true;
  }
  return story.isIcebox;
}

function sortStoriesForPanel(
  panel: PanelType | "CurrentAccepted",
  stories: Story[],
): Story[] {
  return [...stories].sort((a, b) => {
    if (panel === "Done") {
      return b.statusChangedAt.localeCompare(a.statusChangedAt);
    }
    if (panel === "CurrentAccepted") {
      const compared = a.statusChangedAt.localeCompare(b.statusChangedAt);
      if (compared !== 0) return compared;
      return a.id.localeCompare(b.id);
    }
    return a.position - b.position;
  });
}

function uniqueStories(stories: Story[]): Story[] {
  return Array.from(
    new Map(stories.map((story) => [story.id, story])).values(),
  );
}

function flattenPages(pages: PanelStoriesPage[] | undefined): Story[] {
  if (!pages) return [];
  return uniqueStories(pages.flatMap((page) => page.stories));
}

function flattenCurrentAcceptedPages(
  pages: PanelStoriesPage[] | undefined,
): Story[] {
  if (!pages) return [];

  let merged: Story[] = [];
  for (const page of pages) {
    const sortedPage = sortStoriesForPanel("CurrentAccepted", page.stories);
    merged = uniqueStories([...sortedPage, ...merged]);
  }
  return merged;
}

function calculateStoriesTotalPoints(stories: Story[]): number {
  return stories.reduce((sum, story) => sum + (story.storyPoint ?? 0), 0);
}

function calculatePointsByIterationId(
  stories: Story[],
): Record<string, number> {
  const pointsByIterationId: Record<string, number> = {};
  for (const story of stories) {
    if (!story.iterationId) continue;
    pointsByIterationId[story.iterationId] =
      (pointsByIterationId[story.iterationId] ?? 0) + (story.storyPoint ?? 0);
  }
  return pointsByIterationId;
}

function combinePointsByIterationId(
  ...maps: ReadonlyArray<Record<string, number>>
): Record<string, number> {
  const combined: Record<string, number> = {};
  for (const map of maps) {
    for (const [iterationId, points] of Object.entries(map)) {
      combined[iterationId] = (combined[iterationId] ?? 0) + points;
    }
  }
  return combined;
}

function splitStoriesByPage(
  pages: PanelStoriesPage[],
  stories: Story[],
): PanelStoriesPage[] {
  if (pages.length === 0) return pages;

  const lengths = pages.map((page) => page.stories.length);
  let cursor = 0;

  return pages.map((page, index) => {
    const isLast = index === pages.length - 1;
    const nextCursor = isLast ? stories.length : cursor + lengths[index];
    const nextStories = stories.slice(cursor, nextCursor);
    cursor = nextCursor;
    return {
      ...page,
      stories: nextStories,
    };
  });
}

async function fetchPanelStoriesPage(
  projectId: string,
  panel: PanelType,
  currentIterationId: string | null,
  filters: StoryPanelQueryFilters,
  offset: number,
): Promise<PanelStoriesPage> {
  const pageSize = PANEL_PAGE_SIZES[panel];
  const query = panelBaseQuery(panel, currentIterationId, filters);
  query.set("limit", String(pageSize));
  query.set("offset", String(offset));

  const response = await fetch(
    `${projectStoriesApiPath(projectId)}?${query.toString()}`,
  );

  if (!response.ok) {
    const error = new Error(await parseErrorMessage(response)) as QueryError;
    error.status = response.status;
    throw error;
  }

  const payload = (await response.json()) as StoriesResponse;
  const stories = Array.isArray(payload.stories) ? payload.stories : [];

  return {
    stories: uniqueStories(stories),
    pagination: payload.pagination,
  };
}

async function fetchCurrentAcceptedStoriesPage(
  projectId: string,
  currentIterationId: string,
  filters: StoryPanelQueryFilters,
  offset: number,
): Promise<PanelStoriesPage> {
  const query = currentAcceptedBaseQuery(currentIterationId, filters);
  query.set("limit", String(CURRENT_ACCEPTED_PAGE_SIZE));
  query.set("offset", String(offset));

  const response = await fetch(
    `${projectStoriesApiPath(projectId)}?${query.toString()}`,
  );

  if (!response.ok) {
    const error = new Error(await parseErrorMessage(response)) as QueryError;
    error.status = response.status;
    throw error;
  }

  const payload = (await response.json()) as StoriesResponse;
  const stories = Array.isArray(payload.stories) ? payload.stories : [];

  return {
    stories: uniqueStories(stories),
    pagination: payload.pagination,
  };
}

function buildPanelQueryState(
  panelQuery:
    | ReturnType<typeof useInfiniteQuery<PanelStoriesPage>>
    | ReturnType<typeof useInfiniteQuery<PanelStoriesPage>>,
  stories: Story[],
  queryKey: readonly unknown[],
): PanelQueryState {
  const pages = panelQuery.data?.pages;
  const lastPage = pages?.[pages.length - 1];
  return {
    stories,
    total:
      typeof lastPage?.pagination?.total === "number"
        ? lastPage.pagination.total
        : stories.length,
    totalPoints:
      typeof lastPage?.pagination?.summary?.totalPoints === "number"
        ? lastPage.pagination.summary.totalPoints
        : calculateStoriesTotalPoints(stories),
    pointsByIterationId:
      lastPage?.pagination?.summary?.pointsByIterationId ??
      calculatePointsByIterationId(stories),
    statusCode:
      typeof (panelQuery.error as QueryError | null)?.status === "number"
        ? ((panelQuery.error as QueryError).status ?? null)
        : null,
    isLoading: panelQuery.isLoading,
    isFetching: panelQuery.isFetching,
    isFetchingNextPage: panelQuery.isFetchingNextPage,
    error: panelQuery.error instanceof Error ? panelQuery.error.message : null,
    hasNextPage: Boolean(panelQuery.hasNextPage),
    fetchNextPage: async () => {
      await panelQuery.fetchNextPage();
    },
    refetch: async () => {
      await panelQuery.refetch();
    },
    queryKey,
  };
}

export function usePanelStoriesQuery({
  projectId,
  currentIterationId,
  filters,
  enabled,
}: UsePanelStoriesQueryInput) {
  const queryClient = useQueryClient();
  const hasProject = Boolean(projectId);
  const baseEnabled = enabled && hasProject;

  const doneQueryKey = projectId
    ? storyQueryKeys.panelStories(
        projectId,
        "Done",
        currentIterationId,
        filters,
      )
    : ["projects", "missing", "stories", "Done"];
  const currentQueryKey = projectId
    ? storyQueryKeys.panelStories(
        projectId,
        "Current",
        currentIterationId,
        filters,
      )
    : ["projects", "missing", "stories", "Current"];
  const currentAcceptedQueryKey = projectId
    ? ([...currentQueryKey, "accepted"] as const)
    : (["projects", "missing", "stories", "Current", "accepted"] as const);
  const backlogQueryKey = projectId
    ? storyQueryKeys.panelStories(
        projectId,
        "Backlog",
        currentIterationId,
        filters,
      )
    : ["projects", "missing", "stories", "Backlog"];
  const iceboxQueryKey = projectId
    ? storyQueryKeys.panelStories(
        projectId,
        "Icebox",
        currentIterationId,
        filters,
      )
    : ["projects", "missing", "stories", "Icebox"];

  const done = useInfiniteQuery({
    queryKey: doneQueryKey,
    enabled: baseEnabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchPanelStoriesPage(
        projectId as string,
        "Done",
        currentIterationId,
        filters,
        Number(pageParam),
      ),
    getNextPageParam: (lastPage) => {
      if (!lastPage.pagination?.hasNext) return undefined;
      if (typeof lastPage.pagination.nextOffset === "number") {
        return lastPage.pagination.nextOffset;
      }
      return undefined;
    },
  });

  const current = useInfiniteQuery({
    queryKey: currentQueryKey,
    enabled: baseEnabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchPanelStoriesPage(
        projectId as string,
        "Current",
        currentIterationId,
        filters,
        Number(pageParam),
      ),
    getNextPageParam: (lastPage) => {
      if (!lastPage.pagination?.hasNext) return undefined;
      if (typeof lastPage.pagination.nextOffset === "number") {
        return lastPage.pagination.nextOffset;
      }
      return undefined;
    },
  });
  const currentAccepted = useInfiniteQuery({
    queryKey: currentAcceptedQueryKey,
    enabled: baseEnabled && Boolean(currentIterationId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchCurrentAcceptedStoriesPage(
        projectId as string,
        currentIterationId as string,
        filters,
        Number(pageParam),
      ),
    getNextPageParam: (lastPage) => {
      if (!lastPage.pagination?.hasNext) return undefined;
      if (typeof lastPage.pagination.nextOffset === "number") {
        return lastPage.pagination.nextOffset;
      }
      return undefined;
    },
  });

  const backlog = useInfiniteQuery({
    queryKey: backlogQueryKey,
    enabled: baseEnabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchPanelStoriesPage(
        projectId as string,
        "Backlog",
        currentIterationId,
        filters,
        Number(pageParam),
      ),
    getNextPageParam: (lastPage) => {
      if (!lastPage.pagination?.hasNext) return undefined;
      if (typeof lastPage.pagination.nextOffset === "number") {
        return lastPage.pagination.nextOffset;
      }
      return undefined;
    },
  });

  const icebox = useInfiniteQuery({
    queryKey: iceboxQueryKey,
    enabled: baseEnabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchPanelStoriesPage(
        projectId as string,
        "Icebox",
        currentIterationId,
        filters,
        Number(pageParam),
      ),
    getNextPageParam: (lastPage) => {
      if (!lastPage.pagination?.hasNext) return undefined;
      if (typeof lastPage.pagination.nextOffset === "number") {
        return lastPage.pagination.nextOffset;
      }
      return undefined;
    },
  });

  const donePages = done.data?.pages;
  const currentPages = current.data?.pages;
  const currentAcceptedPages = currentAccepted.data?.pages;
  const backlogPages = backlog.data?.pages;
  const iceboxPages = icebox.data?.pages;

  const doneStories = useMemo(() => flattenPages(donePages), [donePages]);
  const currentStories = useMemo(
    () => flattenPages(currentPages),
    [currentPages],
  );
  const currentAcceptedStories = useMemo(
    () => flattenCurrentAcceptedPages(currentAcceptedPages),
    [currentAcceptedPages],
  );
  const mergedCurrentStories = useMemo(
    () => uniqueStories([...currentAcceptedStories, ...currentStories]),
    [currentAcceptedStories, currentStories],
  );
  const backlogStories = useMemo(
    () => flattenPages(backlogPages),
    [backlogPages],
  );
  const iceboxStories = useMemo(() => flattenPages(iceboxPages), [iceboxPages]);

  const panels: PanelQueryMap = useMemo(
    () => ({
      Done: buildPanelQueryState(done, doneStories, doneQueryKey),
      Current: {
        ...buildPanelQueryState(current, mergedCurrentStories, currentQueryKey),
        total:
          (typeof currentAcceptedPages?.[currentAcceptedPages.length - 1]
            ?.pagination?.total === "number"
            ? (currentAcceptedPages[currentAcceptedPages.length - 1]?.pagination
                ?.total ?? 0)
            : currentAcceptedStories.length) +
          (typeof currentPages?.[currentPages.length - 1]?.pagination?.total ===
          "number"
            ? (currentPages[currentPages.length - 1]?.pagination?.total ?? 0)
            : currentStories.length),
        totalPoints:
          (typeof currentAcceptedPages?.[currentAcceptedPages.length - 1]
            ?.pagination?.summary?.totalPoints === "number"
            ? (currentAcceptedPages[currentAcceptedPages.length - 1]?.pagination
                ?.summary?.totalPoints ?? 0)
            : calculateStoriesTotalPoints(currentAcceptedStories)) +
          (typeof currentPages?.[currentPages.length - 1]?.pagination?.summary
            ?.totalPoints === "number"
            ? (currentPages[currentPages.length - 1]?.pagination?.summary
                ?.totalPoints ?? 0)
            : calculateStoriesTotalPoints(currentStories)),
        pointsByIterationId: combinePointsByIterationId(
          currentAcceptedPages?.[currentAcceptedPages.length - 1]?.pagination
            ?.summary?.pointsByIterationId ??
            calculatePointsByIterationId(currentAcceptedStories),
          currentPages?.[currentPages.length - 1]?.pagination?.summary
            ?.pointsByIterationId ??
            calculatePointsByIterationId(currentStories),
        ),
        isLoading:
          current.isLoading ||
          (Boolean(currentIterationId) && currentAccepted.isLoading),
        isFetching:
          current.isFetching ||
          (Boolean(currentIterationId) && currentAccepted.isFetching),
        error:
          current.error instanceof Error
            ? current.error.message
            : currentAccepted.error instanceof Error
              ? currentAccepted.error.message
              : null,
        refetch: async () => {
          await Promise.all([current.refetch(), currentAccepted.refetch()]);
        },
      },
      Backlog: buildPanelQueryState(backlog, backlogStories, backlogQueryKey),
      Icebox: buildPanelQueryState(icebox, iceboxStories, iceboxQueryKey),
    }),
    [
      backlog,
      backlogQueryKey,
      backlogStories,
      current,
      currentAccepted,
      currentAcceptedPages,
      currentAcceptedStories,
      currentQueryKey,
      currentStories,
      currentPages,
      done,
      doneQueryKey,
      doneStories,
      icebox,
      iceboxQueryKey,
      iceboxStories,
      mergedCurrentStories,
      currentIterationId,
    ],
  );

  const panelQueryMap: Record<PanelType, readonly unknown[]> = {
    Done: doneQueryKey,
    Current: currentQueryKey,
    Backlog: backlogQueryKey,
    Icebox: iceboxQueryKey,
  };

  const patchPanelData = (
    panel: PanelType | "CurrentAccepted",
    updater: (stories: Story[]) => Story[],
    options?: { preserveOrder?: boolean },
  ) => {
    if (!projectId) return;
    const queryKey =
      panel === "CurrentAccepted"
        ? currentAcceptedQueryKey
        : panelQueryMap[panel];
    queryClient.setQueryData<PanelStoriesData | undefined>(
      queryKey,
      (currentData) => {
        if (!currentData || currentData.pages.length === 0) return currentData;

        const flattened = flattenPages(currentData.pages);
        const nextStories = updater(flattened);
        if (nextStories === flattened) return currentData;

        const normalizedStories =
          options?.preserveOrder === true
            ? uniqueStories(nextStories)
            : sortStoriesForPanel(panel, uniqueStories(nextStories));
        return {
          ...currentData,
          pages: splitStoriesByPage(currentData.pages, normalizedStories),
        };
      },
    );
  };

  const applyStoryUpdate = (updatedStory: Story) => {
    const shouldContainInDone = storyMatchesPanel(
      updatedStory,
      "Done",
      currentIterationId,
    );
    const shouldContainInCurrent = storyMatchesPanel(
      updatedStory,
      "Current",
      currentIterationId,
    );
    const shouldContainInBacklog = storyMatchesPanel(
      updatedStory,
      "Backlog",
      currentIterationId,
    );
    const shouldContainInIcebox = storyMatchesPanel(
      updatedStory,
      "Icebox",
      currentIterationId,
    );
    const shouldContainInCurrentAccepted =
      shouldContainInCurrent && updatedStory.status === "Accepted";

    patchPanelData("Done", (stories) => {
      const hasStory = stories.some((story) => story.id === updatedStory.id);
      if (!hasStory && !shouldContainInDone) return stories;
      const remaining = stories.filter((story) => story.id !== updatedStory.id);
      return shouldContainInDone ? [...remaining, updatedStory] : remaining;
    });
    patchPanelData("Current", (stories) => {
      const hasStory = stories.some((story) => story.id === updatedStory.id);
      const shouldContain =
        shouldContainInCurrent && !shouldContainInCurrentAccepted;
      if (!hasStory && !shouldContain) return stories;
      const remaining = stories.filter((story) => story.id !== updatedStory.id);
      return shouldContain ? [...remaining, updatedStory] : remaining;
    });
    patchPanelData("CurrentAccepted", (stories) => {
      const hasStory = stories.some((story) => story.id === updatedStory.id);
      if (!hasStory && !shouldContainInCurrentAccepted) return stories;
      const remaining = stories.filter((story) => story.id !== updatedStory.id);
      return shouldContainInCurrentAccepted
        ? [...remaining, updatedStory]
        : remaining;
    });
    patchPanelData("Backlog", (stories) => {
      const hasStory = stories.some((story) => story.id === updatedStory.id);
      if (!hasStory && !shouldContainInBacklog) return stories;
      const remaining = stories.filter((story) => story.id !== updatedStory.id);
      return shouldContainInBacklog ? [...remaining, updatedStory] : remaining;
    });
    patchPanelData("Icebox", (stories) => {
      const hasStory = stories.some((story) => story.id === updatedStory.id);
      if (!hasStory && !shouldContainInIcebox) return stories;
      const remaining = stories.filter((story) => story.id !== updatedStory.id);
      return shouldContainInIcebox ? [...remaining, updatedStory] : remaining;
    });
  };

  const applyStoriesUpdate = (stories: Story[]) => {
    for (const story of stories) {
      applyStoryUpdate(story);
    }
  };

  const removeStory = (storyId: string) => {
    for (const panel of ALL_PANELS) {
      patchPanelData(panel, (stories) => {
        if (!stories.some((story) => story.id === storyId)) {
          return stories;
        }
        return stories.filter((story) => story.id !== storyId);
      });
    }
    patchPanelData("CurrentAccepted", (stories) => {
      if (!stories.some((story) => story.id === storyId)) {
        return stories;
      }
      return stories.filter((story) => story.id !== storyId);
    });
  };

  const replacePanelStories = (panel: PanelType, stories: Story[]) => {
    // Preserve caller-provided order for optimistic DnD updates.
    patchPanelData(panel, () => stories, { preserveOrder: true });
  };

  const applyExistingStoriesInPanel = (panel: PanelType, stories: Story[]) => {
    const updatesById = new Map(stories.map((story) => [story.id, story]));
    patchPanelData(panel, (currentStories) => {
      let changed = false;
      const next = currentStories.map((story) => {
        const updated = updatesById.get(story.id);
        if (!updated) return story;
        if (updated === story) return story;
        changed = true;
        return updated;
      });
      return changed ? next : currentStories;
    });
  };

  const isAnyLoading =
    panels.Done.isLoading ||
    panels.Current.isLoading ||
    panels.Backlog.isLoading ||
    panels.Icebox.isLoading;

  const refetchAll = async () => {
    await Promise.all([
      panels.Done.refetch(),
      panels.Current.refetch(),
      panels.Backlog.refetch(),
      panels.Icebox.refetch(),
    ]);
  };

  const invalidatePanels = async ({
    panels,
    refetchType = "none",
  }: InvalidatePanelsInput = {}) => {
    if (!projectId) return;

    const targetPanels =
      panels && panels.length > 0 ? Array.from(new Set(panels)) : ALL_PANELS;

    await Promise.all(
      targetPanels.flatMap((panel) => {
        const keys =
          panel === "Current"
            ? [panelQueryMap[panel], currentAcceptedQueryKey]
            : [panelQueryMap[panel]];
        return keys.map((queryKey) =>
          queryClient.invalidateQueries({
            queryKey,
            refetchType,
          }),
        );
      }),
    );
  };

  const cancelPanels = async ({ panels }: PanelSelectionInput = {}) => {
    if (!projectId) return;
    const targetPanels =
      panels && panels.length > 0 ? Array.from(new Set(panels)) : ALL_PANELS;
    await Promise.all(
      targetPanels.flatMap((panel) => {
        const keys =
          panel === "Current"
            ? [panelQueryMap[panel], currentAcceptedQueryKey]
            : [panelQueryMap[panel]];
        return keys.map((queryKey) => queryClient.cancelQueries({ queryKey }));
      }),
    );
  };

  const snapshotPanels = ({
    panels,
  }: PanelSelectionInput = {}): PanelRollbackSnapshot => {
    if (!projectId) return {};
    const targetPanels =
      panels && panels.length > 0 ? Array.from(new Set(panels)) : ALL_PANELS;
    const snapshot: PanelRollbackSnapshot = {};
    for (const panel of targetPanels) {
      snapshot[panel] = queryClient.getQueryData<PanelStoriesData | undefined>(
        panelQueryMap[panel],
      );
      if (panel === "Current") {
        snapshot.Current = queryClient.getQueryData<
          PanelStoriesData | undefined
        >(currentQueryKey);
        snapshot.CurrentAccepted = queryClient.getQueryData<
          PanelStoriesData | undefined
        >(currentAcceptedQueryKey);
      }
    }
    return snapshot;
  };

  const restorePanelsSnapshot = (snapshot: PanelRollbackSnapshot) => {
    if (!projectId) return;
    for (const panel of ALL_PANELS) {
      if (!(panel in snapshot)) continue;
      queryClient.setQueryData(panelQueryMap[panel], snapshot[panel]);
    }
    const currentAcceptedSnapshot = snapshot.CurrentAccepted;
    if (typeof currentAcceptedSnapshot !== "undefined") {
      queryClient.setQueryData(
        currentAcceptedQueryKey,
        currentAcceptedSnapshot,
      );
    }
  };

  return {
    panels,
    currentAccepted: {
      ...buildPanelQueryState(
        currentAccepted,
        currentAcceptedStories,
        currentAcceptedQueryKey,
      ),
      total:
        typeof currentAcceptedPages?.[currentAcceptedPages.length - 1]
          ?.pagination?.total === "number"
          ? (currentAcceptedPages[currentAcceptedPages.length - 1]?.pagination
              ?.total ?? 0)
          : currentAcceptedStories.length,
    } satisfies CurrentAcceptedQueryState,
    isAnyLoading,
    refetchAll,
    invalidatePanels,
    cancelPanels,
    snapshotPanels,
    restorePanelsSnapshot,
    applyStoryUpdate,
    applyStoriesUpdate,
    removeStory,
    replacePanelStories,
    applyExistingStoriesInPanel,
  };
}
