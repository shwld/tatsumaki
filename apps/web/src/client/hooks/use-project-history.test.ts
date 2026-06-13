import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useProjectHistory } from "./use-project-history";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

describe("useProjectHistory", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and returns history entries", async () => {
    const mockHistory = [
      {
        __typename: "ProjectHistoryEntry",
        id: "act-1",
        storyId: "story-1",
        storyTitle: "Build login page",
        actorUserId: "user-1",
        actorName: "user@example.com",
        action: "created",
        fieldName: "story",
        oldValue: null,
        newValue: "Build login page",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          history: mockHistory,
          hasMore: false,
          nextCursor: null,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useProjectHistory("project-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].storyTitle).toBe("Build login page");
    expect(result.current.error).toBeNull();
  });

  it("sets error on fetch failure", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

    const { result } = renderHook(() => useProjectHistory("project-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("プロジェクト履歴の取得に失敗しました");
    expect(result.current.history).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network offline"));

    const { result } = renderHook(() => useProjectHistory("project-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("network offline");
    expect(result.current.history).toEqual([]);
  });
});
