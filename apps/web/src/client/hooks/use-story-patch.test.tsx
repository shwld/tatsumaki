import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ToastProvider } from "../contexts/toast-context";
import type { Story } from "../types/story";
import { useStoryPatch } from "./use-story-patch";

function createStory(overrides: Partial<Story> = {}): Story {
  return {
    __typename: "Story",
    id: "story-1",
    projectId: "project-1",
    title: "Story 1",
    description: "",
    type: "feature",
    status: "Unstarted",
    statusChangedAt: "2026-01-01T00:00:00.000Z",
    storyPoint: 3,
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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        AuthErrorProvider,
        null,
        createElement(ToastProvider, null, children),
      ),
    );
  };
}

function deferredResponse() {
  let resolve: (response: Response) => void = () => {};
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("useStoryPatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies optimistic update immediately and keeps latest success when requests overlap", async () => {
    const first = deferredResponse();
    const second = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => second.promise);
    vi.stubGlobal("fetch", fetchMock);

    const onStoryUpdated = vi.fn();
    const baseStory = createStory();
    const { result } = renderHook(
      () =>
        useStoryPatch("project-1", "1", onStoryUpdated, {
          getOptimisticBaseStory: () => baseStory,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      void result.current.patchStory({ storyPoint: 5 });
      void result.current.patchStory({ storyPoint: 8 });
    });

    expect(onStoryUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ storyPoint: 5 }),
    );
    expect(onStoryUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ storyPoint: 8 }),
    );

    second.resolve(
      new Response(
        JSON.stringify({
          story: createStory({ storyPoint: 8 }),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    first.resolve(
      new Response(
        JSON.stringify({
          story: createStory({ storyPoint: 5 }),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await waitFor(() => {
      expect(onStoryUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ storyPoint: 8 }),
      );
    });
    const lastCall =
      onStoryUpdated.mock.calls[onStoryUpdated.mock.calls.length - 1]?.[0];
    expect(lastCall.storyPoint).toBe(8);
  });
});
