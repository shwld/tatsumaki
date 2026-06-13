import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import { useStoryComments, useStoryDetail } from "./use-story-detail";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

describe("useStoryComments", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and filters comment entries", async () => {
    const timeline = [
      { entryType: "comment", id: "c1", text: "hello" },
      { entryType: "status_change", id: "s1" },
      { entryType: "comment", id: "c2", text: "world" },
    ];

    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          timeline,
          hasMore: false,
          nextCursor: null,
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useStoryComments("p1", "s1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.comments).toHaveLength(2);
    expect(result.current.comments[0].id).toBe("c1");
    expect(result.current.error).toBeNull();
  });

  it("sets error on failed fetch", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

    const { result } = renderHook(() => useStoryComments("p1", "s1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("タイムラインの取得に失敗しました");
    expect(result.current.comments).toEqual([]);
  });

  it("sets error on network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useStoryComments("p1", "s1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("offline");
  });
});

describe("useStoryDetail", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches story detail", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          story: {
            id: "s1",
            projectId: "p1",
            title: "Story",
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useStoryDetail("p1", "s1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.story).toEqual(
      expect.objectContaining({ id: "s1", projectId: "p1", title: "Story" }),
    );
    expect(result.current.error).toBeNull();
  });

  it("sets error on failed story detail fetch", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));

    const { result } = renderHook(() => useStoryDetail("p1", "s1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.story).toBeNull();
    expect(result.current.error).toBe("ストーリーが見つかりません");
  });
});
