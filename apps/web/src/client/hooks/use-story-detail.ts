import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { storyQueryKeys } from "./story-query-keys";
import {
  HttpStatusError,
  isAuthError,
  isForbiddenError,
  isHttpStatusError,
} from "../lib/api-error";
import { parseErrorMessage } from "../lib/parse-error-message";
import {
  projectStoriesApiPath,
  projectStoryTimelineApiPath,
} from "../lib/story-routes";
import type {
  Story,
  StoryResponse,
  StoryTimelineCommentEntry,
  StoryTimelineEntry,
  StoryTimelineResponse,
} from "../types/story";

export const STORY_TIMELINE_PAGE_SIZE = 30;

type UseStoryCommentsResult = {
  comments: StoryTimelineCommentEntry[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

type UseStoryDetailResult = {
  story: Story | null;
  isLoading: boolean;
  error: string | null;
  errorStatus?: number;
};

type UseStoryDetailOptions = {
  enabled?: boolean;
};

async function fetchStoryTimelinePage(
  projectId: string,
  storyNumber: string,
  pageParam: string | undefined,
): Promise<StoryTimelineResponse> {
  const response = await fetch(
    projectStoryTimelineApiPath(projectId, storyNumber, {
      limit: STORY_TIMELINE_PAGE_SIZE,
      ...(pageParam ? { before: pageParam } : {}),
    }),
  );

  if (!response.ok) {
    throw new Error("タイムラインの取得に失敗しました");
  }

  return (await response.json()) as StoryTimelineResponse;
}

async function fetchStoryDetail(
  projectId: string,
  storyNumber: string,
): Promise<Story> {
  const response = await fetch(
    `${projectStoriesApiPath(projectId)}/${encodeURIComponent(storyNumber)}`,
  );
  if (isAuthError(response.status)) {
    throw new HttpStatusError("セッションの有効期限が切れています", 401);
  }
  if (isForbiddenError(response.status)) {
    throw new HttpStatusError(await parseErrorMessage(response), 403);
  }
  if (response.status === 404) {
    throw new HttpStatusError("ストーリーが見つかりません", 404);
  }
  if (!response.ok) {
    throw new HttpStatusError(
      await parseErrorMessage(response),
      response.status,
    );
  }

  const data = (await response.json()) as StoryResponse;
  return data.story;
}

export function useStoryTimeline(
  projectId: string,
  storyNumber: string,
): {
  timeline: StoryTimelineEntry[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  loadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
} {
  const queryClient = useQueryClient();
  const enabled = Boolean(projectId && storyNumber);
  const query = useInfiniteQuery({
    queryKey: storyQueryKeys.storyTimeline(projectId, storyNumber),
    queryFn: ({ pageParam }) =>
      fetchStoryTimelinePage(
        projectId,
        storyNumber,
        pageParam as string | undefined,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    staleTime: 60_000,
    enabled,
  });

  const timeline = useMemo((): StoryTimelineEntry[] => {
    const pages = query.data?.pages;
    if (!pages?.length) {
      return [];
    }
    return pages.reduceRight<StoryTimelineEntry[]>(
      (acc, page) => acc.concat(page.timeline),
      [],
    );
  }, [query.data?.pages]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: storyQueryKeys.storyTimeline(projectId, storyNumber),
    });
  }, [projectId, queryClient, storyNumber]);

  const loadMore = useCallback(() => {
    void query.fetchNextPage();
  }, [query.fetchNextPage]);

  return {
    timeline,
    isLoading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    refresh,
    loadMore,
    hasMore: Boolean(query.hasNextPage),
    isLoadingMore: query.isFetchingNextPage,
  };
}

export function useStoryComments(
  projectId: string,
  storyNumber: string,
): UseStoryCommentsResult {
  const { timeline, isLoading, error, refresh } = useStoryTimeline(
    projectId,
    storyNumber,
  );
  const comments = useMemo(
    (): StoryTimelineCommentEntry[] =>
      timeline.filter(
        (entry): entry is StoryTimelineCommentEntry =>
          entry.entryType === "comment",
      ),
    [timeline],
  );

  return {
    comments,
    isLoading,
    error,
    refresh,
  };
}

export function useStoryDetail(
  projectId: string,
  storyNumber: string,
  options: UseStoryDetailOptions = {},
): UseStoryDetailResult {
  const enabled = options.enabled ?? Boolean(projectId && storyNumber);
  const query = useQuery({
    queryKey: storyQueryKeys.storyDetail(projectId, storyNumber),
    queryFn: () => fetchStoryDetail(projectId, storyNumber),
    staleTime: 60_000,
    enabled,
  });

  return {
    story: query.data ?? null,
    isLoading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    errorStatus: isHttpStatusError(query.error)
      ? query.error.status
      : undefined,
  };
}
