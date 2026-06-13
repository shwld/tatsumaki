import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { projectHistoryApiPath } from "../lib/story-routes";
import type {
  ProjectHistoryEntry,
  ProjectHistoryResponse,
} from "../types/story";
import { storyQueryKeys } from "./story-query-keys";

export const PROJECT_HISTORY_PAGE_SIZE = 30;

async function fetchProjectHistoryPage(
  projectId: string,
  pageParam: string | undefined,
): Promise<ProjectHistoryResponse> {
  const response = await fetch(
    projectHistoryApiPath(projectId, {
      limit: PROJECT_HISTORY_PAGE_SIZE,
      ...(pageParam ? { before: pageParam } : {}),
    }),
  );

  if (!response.ok) {
    throw new Error("プロジェクト履歴の取得に失敗しました");
  }

  return (await response.json()) as ProjectHistoryResponse;
}

type UseProjectHistoryResult = {
  history: ProjectHistoryEntry[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
};

export function useProjectHistory(projectId: string): UseProjectHistoryResult {
  const enabled = Boolean(projectId);
  const query = useInfiniteQuery({
    queryKey: storyQueryKeys.projectHistory(projectId),
    queryFn: ({ pageParam }) =>
      fetchProjectHistoryPage(projectId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    staleTime: 30_000,
    enabled,
  });

  const history = useMemo((): ProjectHistoryEntry[] => {
    const pages = query.data?.pages;
    if (!pages?.length) {
      return [];
    }
    return pages.flatMap((page) => page.history);
  }, [query.data?.pages]);

  const loadMore = useCallback(() => {
    void query.fetchNextPage();
  }, [query.fetchNextPage]);

  return {
    history,
    isLoading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    hasMore: Boolean(query.hasNextPage),
    loadMore,
    isLoadingMore: query.isFetchingNextPage,
  };
}
