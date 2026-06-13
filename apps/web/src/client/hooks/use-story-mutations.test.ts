import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { planStoryMoveToPanel } from "../lib/story-panel-transition";
import type { PanelType } from "../lib/panel-visibility";
import type { Story } from "../types/story";
import { useStoryMutations } from "./use-story-mutations";
import type {
  PanelRollbackSnapshot,
  usePanelStoriesQuery,
} from "./use-panel-stories-query";

const PROJECT_ID = "project-1";
const CURRENT_ITERATION_ID = "iter-current";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

function deferredResponse() {
  let resolve: (value: Response) => void = () => {};
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function buildStory(overrides: Partial<Story> = {}): Story {
  return {
    __typename: "Story",
    id: "story-1",
    projectId: PROJECT_ID,
    title: "Story 1",
    description: "desc",
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

function createPanelQueriesMock() {
  const snapshot: PanelRollbackSnapshot = {};
  const mock = {
    cancelPanels: vi.fn(async () => {}),
    snapshotPanels: vi.fn(() => snapshot),
    restorePanelsSnapshot: vi.fn(),
    applyStoryUpdate: vi.fn(),
    applyStoriesUpdate: vi.fn(),
    removeStory: vi.fn(),
    invalidatePanels: vi.fn(async () => {}),
  };
  return mock as unknown as ReturnType<typeof usePanelStoriesQuery>;
}

describe("useStoryMutations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies optimistic status update immediately and keeps rollback data", async () => {
    const story = buildStory();
    const deferred = deferredResponse();
    const panelQueries = createPanelQueriesMock();
    const notifySessionExpired = vi.fn();
    const setForbidden = vi.fn();
    const setError = vi.fn();
    const showToast = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: string | URL, init?: RequestInit): Promise<Response> => {
          const url = String(input);
          if (
            url ===
              `/api/projects/${PROJECT_ID}/iterations/${CURRENT_ITERATION_ID}/stories` &&
            init?.method === "POST"
          ) {
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }
          if (
            url === `/api/projects/${PROJECT_ID}/stories/${story.storyNumber}`
          ) {
            return deferred.promise;
          }
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
          });
        },
      ),
    );

    const { result } = renderHook(
      () =>
        useStoryMutations({
          projectId: PROJECT_ID,
          panelQueries,
          notifySessionExpired,
          setForbidden,
          setError,
          showToast,
        }),
      { wrapper: createWrapper() },
    );

    let promise: Promise<Story> | null = null;
    await act(async () => {
      promise = result.current.statusMutation.mutateAsync({
        story,
        nextStatus: "Started",
        currentIterationId: CURRENT_ITERATION_ID,
      });
    });
    if (!promise) {
      throw new Error("mutation promise was not created");
    }

    expect(panelQueries.cancelPanels).toHaveBeenCalledTimes(1);
    expect(panelQueries.snapshotPanels).toHaveBeenCalledTimes(1);
    expect(panelQueries.applyStoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: story.id,
        status: "Started",
        iterationId: CURRENT_ITERATION_ID,
      }),
    );

    deferred.resolve(
      new Response(
        JSON.stringify({
          story: {
            ...story,
            status: "Started",
            iterationId: CURRENT_ITERATION_ID,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(promise).resolves.toEqual(
      expect.objectContaining({
        status: "Started",
        iterationId: CURRENT_ITERATION_ID,
      }),
    );
    expect(notifySessionExpired).not.toHaveBeenCalled();
    expect(setForbidden).not.toHaveBeenCalled();
  });

  it("assigns current iteration and clears icebox when starting from Icebox", async () => {
    const story = buildStory({ isIcebox: true });
    const fetchMock = vi.fn(
      async (input: string | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (
          url ===
            `/api/projects/${PROJECT_ID}/iterations/${CURRENT_ITERATION_ID}/stories` &&
          init?.method === "POST"
        ) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (
          url === `/api/projects/${PROJECT_ID}/stories/${story.storyNumber}`
        ) {
          const body = init?.body
            ? (JSON.parse(String(init.body)) as {
                status?: string;
                isIcebox?: boolean;
              })
            : {};
          expect(body.status).toBe("Started");
          expect(body.isIcebox).toBe(false);
          return new Response(
            JSON.stringify({
              story: {
                ...story,
                status: "Started",
                iterationId: CURRENT_ITERATION_ID,
                isIcebox: false,
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const panelQueries = createPanelQueriesMock();
    const { result } = renderHook(
      () =>
        useStoryMutations({
          projectId: PROJECT_ID,
          panelQueries,
          notifySessionExpired: vi.fn(),
          setForbidden: vi.fn(),
          setError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.statusMutation.mutateAsync({
        story,
        nextStatus: "Started",
        currentIterationId: CURRENT_ITERATION_ID,
      });
    });

    const patchCalls = fetchMock.mock.calls.filter(
      (c) =>
        String(c[0]) ===
        `/api/projects/${PROJECT_ID}/stories/${story.storyNumber}`,
    );
    expect(patchCalls.length).toBeGreaterThanOrEqual(1);
    expect(panelQueries.applyStoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: story.id,
        status: "Started",
        iterationId: CURRENT_ITERATION_ID,
        isIcebox: false,
      }),
    );
  });

  it("rolls back optimistic status update when request fails", async () => {
    const story = buildStory();
    const deferred = deferredResponse();
    const panelQueries = createPanelQueriesMock();
    const notifySessionExpired = vi.fn();
    const setForbidden = vi.fn();
    const setError = vi.fn();
    const showToast = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: string | URL, init?: RequestInit): Promise<Response> => {
          const url = String(input);
          if (
            url ===
              `/api/projects/${PROJECT_ID}/iterations/${CURRENT_ITERATION_ID}/stories` &&
            init?.method === "POST"
          ) {
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }
          if (
            url === `/api/projects/${PROJECT_ID}/stories/${story.storyNumber}`
          ) {
            return deferred.promise;
          }
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
          });
        },
      ),
    );

    const { result } = renderHook(
      () =>
        useStoryMutations({
          projectId: PROJECT_ID,
          panelQueries,
          notifySessionExpired,
          setForbidden,
          setError,
          showToast,
        }),
      { wrapper: createWrapper() },
    );

    let mutationPromise: Promise<Story> | null = null;
    await act(async () => {
      mutationPromise = result.current.statusMutation.mutateAsync({
        story,
        nextStatus: "Started",
        currentIterationId: CURRENT_ITERATION_ID,
      });
    });
    if (!mutationPromise) {
      throw new Error("mutation promise was not created");
    }

    deferred.resolve(
      new Response(JSON.stringify({ error: "status failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(mutationPromise).rejects.toBeInstanceOf(Error);
    await waitFor(() => {
      expect(panelQueries.restorePanelsSnapshot).toHaveBeenCalledTimes(1);
    });
    expect(setError).toHaveBeenCalledWith("status failed");
    expect(showToast).toHaveBeenCalledWith(
      "error",
      "ステータスの更新に失敗しました。再度お試しください。",
    );
  });

  it("keeps current iteration when status is changed to Unstarted", async () => {
    const story = buildStory({
      status: "Started",
      iterationId: CURRENT_ITERATION_ID,
    });
    const deferred = deferredResponse();
    const panelQueries = createPanelQueriesMock();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: string | URL, init?: RequestInit): Promise<Response> => {
          const url = String(input);
          if (
            url ===
              `/api/projects/${PROJECT_ID}/stories/${story.storyNumber}` &&
            init?.method === "PATCH"
          ) {
            return deferred.promise;
          }
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
          });
        },
      ),
    );

    const { result } = renderHook(
      () =>
        useStoryMutations({
          projectId: PROJECT_ID,
          panelQueries,
          notifySessionExpired: vi.fn(),
          setForbidden: vi.fn(),
          setError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper: createWrapper() },
    );

    let promise: Promise<Story> | null = null;
    await act(async () => {
      promise = result.current.statusMutation.mutateAsync({
        story,
        nextStatus: "Unstarted",
        currentIterationId: CURRENT_ITERATION_ID,
      });
    });

    expect(panelQueries.applyStoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: story.id,
        status: "Unstarted",
        iterationId: CURRENT_ITERATION_ID,
      }),
    );

    deferred.resolve(
      new Response(
        JSON.stringify({
          story: {
            ...story,
            status: "Unstarted",
            iterationId: CURRENT_ITERATION_ID,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(promise).resolves.toEqual(
      expect.objectContaining({
        status: "Unstarted",
        iterationId: CURRENT_ITERATION_ID,
      }),
    );
  });

  it("clears non-current iteration when status is changed to Unstarted", async () => {
    const story = buildStory({
      status: "Started",
      iterationId: "iter-old",
    });
    const deferred = deferredResponse();
    const panelQueries = createPanelQueriesMock();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: string | URL, init?: RequestInit): Promise<Response> => {
          const url = String(input);
          if (
            url ===
              `/api/projects/${PROJECT_ID}/stories/${story.storyNumber}` &&
            init?.method === "PATCH"
          ) {
            return deferred.promise;
          }
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
          });
        },
      ),
    );

    const { result } = renderHook(
      () =>
        useStoryMutations({
          projectId: PROJECT_ID,
          panelQueries,
          notifySessionExpired: vi.fn(),
          setForbidden: vi.fn(),
          setError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper: createWrapper() },
    );

    let promise: Promise<Story> | null = null;
    await act(async () => {
      promise = result.current.statusMutation.mutateAsync({
        story,
        nextStatus: "Unstarted",
        currentIterationId: CURRENT_ITERATION_ID,
      });
    });

    expect(panelQueries.applyStoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: story.id,
        status: "Unstarted",
        iterationId: null,
      }),
    );

    deferred.resolve(
      new Response(
        JSON.stringify({
          story: {
            ...story,
            status: "Unstarted",
            iterationId: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(promise).resolves.toEqual(
      expect.objectContaining({
        status: "Unstarted",
        iterationId: null,
      }),
    );
  });

  it("applies optimistic panel move immediately", async () => {
    const story = buildStory();
    const plan = planStoryMoveToPanel({
      story,
      targetPanel: "Current",
      currentIterationId: CURRENT_ITERATION_ID,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const panelQueries = createPanelQueriesMock();
    const setError = vi.fn();
    const showToast = vi.fn();

    const fetchMock = vi.fn(
      async (input: string | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (
          url ===
            `/api/projects/${PROJECT_ID}/iterations/${CURRENT_ITERATION_ID}/stories` &&
          init?.method === "POST"
        ) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (
          url === `/api/projects/${PROJECT_ID}/stories/${story.storyNumber}`
        ) {
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
          });
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        });
      },
    );

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () =>
        useStoryMutations({
          projectId: PROJECT_ID,
          panelQueries,
          notifySessionExpired: vi.fn(),
          setForbidden: vi.fn(),
          setError,
          showToast,
        }),
      { wrapper: createWrapper() },
    );

    let promise: Promise<Story> | null = null;
    await act(async () => {
      promise = result.current.movePanelMutation.mutateAsync({
        story,
        targetPanel: "Current" as PanelType,
        plan,
      });
    });
    if (!promise) {
      throw new Error("mutation promise was not created");
    }

    expect(panelQueries.applyStoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: story.id,
        status: "Unstarted",
        iterationId: CURRENT_ITERATION_ID,
        isIcebox: false,
      }),
    );

    await expect(promise).resolves.toEqual(
      expect.objectContaining({
        status: "Unstarted",
        iterationId: CURRENT_ITERATION_ID,
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/projects/${PROJECT_ID}/iterations/${CURRENT_ITERATION_ID}/stories`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      `/api/projects/${PROJECT_ID}/stories/${story.storyNumber}`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("rolls back optimistic panel move when request fails", async () => {
    const story = buildStory();
    const plan = planStoryMoveToPanel({
      story,
      targetPanel: "Current",
      currentIterationId: CURRENT_ITERATION_ID,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const deferred = deferredResponse();
    const panelQueries = createPanelQueriesMock();
    const setError = vi.fn();
    const showToast = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: string | URL, init?: RequestInit): Promise<Response> => {
          const url = String(input);
          if (
            url ===
              `/api/projects/${PROJECT_ID}/iterations/${CURRENT_ITERATION_ID}/stories` &&
            init?.method === "POST"
          ) {
            return deferred.promise;
          }
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
          });
        },
      ),
    );

    const { result } = renderHook(
      () =>
        useStoryMutations({
          projectId: PROJECT_ID,
          panelQueries,
          notifySessionExpired: vi.fn(),
          setForbidden: vi.fn(),
          setError,
          showToast,
        }),
      { wrapper: createWrapper() },
    );

    let mutationPromise: Promise<Story> | null = null;
    await act(async () => {
      mutationPromise = result.current.movePanelMutation.mutateAsync({
        story,
        targetPanel: "Current",
        plan,
      });
    });
    if (!mutationPromise) {
      throw new Error("mutation promise was not created");
    }
    deferred.resolve(
      new Response(JSON.stringify({ error: "move failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(mutationPromise).rejects.toBeInstanceOf(Error);
    await waitFor(() => {
      expect(panelQueries.restorePanelsSnapshot).toHaveBeenCalledTimes(1);
    });
    expect(setError).toHaveBeenCalledWith("move failed");
    expect(showToast).toHaveBeenCalledWith(
      "error",
      "パネル移動に失敗しました。再度お試しください。",
    );
  });

  it("shows only toast for panel move conflict errors", async () => {
    const story = buildStory({
      storyPoint: null,
      type: "feature",
      status: "Started",
      iterationId: CURRENT_ITERATION_ID,
    });
    const plan = planStoryMoveToPanel({
      story,
      targetPanel: "Backlog",
      currentIterationId: CURRENT_ITERATION_ID,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const deferred = deferredResponse();
    const panelQueries = createPanelQueriesMock();
    const setError = vi.fn();
    const showToast = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: string | URL, init?: RequestInit): Promise<Response> => {
          const url = String(input);
          if (
            url ===
              `/api/projects/${PROJECT_ID}/stories/${story.storyNumber}` &&
            init?.method === "PATCH"
          ) {
            return deferred.promise;
          }
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
          });
        },
      ),
    );

    const { result } = renderHook(
      () =>
        useStoryMutations({
          projectId: PROJECT_ID,
          panelQueries,
          notifySessionExpired: vi.fn(),
          setForbidden: vi.fn(),
          setError,
          showToast,
        }),
      { wrapper: createWrapper() },
    );

    let mutationPromise: Promise<Story> | null = null;
    await act(async () => {
      mutationPromise = result.current.movePanelMutation.mutateAsync({
        story,
        targetPanel: "Backlog",
        plan,
      });
    });
    if (!mutationPromise) {
      throw new Error("mutation promise was not created");
    }

    deferred.resolve(
      new Response(
        JSON.stringify({
          error:
            "Cannot change status to Started without an estimate. Please set a story point first.",
        }),
        {
          status: 409,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(mutationPromise).rejects.toBeInstanceOf(Error);
    await waitFor(() => {
      expect(panelQueries.restorePanelsSnapshot).toHaveBeenCalledTimes(1);
    });
    expect(setError).toHaveBeenCalledWith(null);
    expect(showToast).toHaveBeenCalledWith(
      "error",
      "Cannot change status to Started without an estimate. Please set a story point first.",
    );
  });

  it("applies optimistic delete immediately", async () => {
    const story = buildStory();
    const deferred = deferredResponse();
    const panelQueries = createPanelQueriesMock();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL): Promise<Response> => {
        const url = String(input);
        if (
          url === `/api/projects/${PROJECT_ID}/stories/${story.storyNumber}`
        ) {
          return deferred.promise;
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        });
      }),
    );

    const { result } = renderHook(
      () =>
        useStoryMutations({
          projectId: PROJECT_ID,
          panelQueries,
          notifySessionExpired: vi.fn(),
          setForbidden: vi.fn(),
          setError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper: createWrapper() },
    );

    let mutationPromise: Promise<void> | null = null;
    await act(async () => {
      mutationPromise = result.current.deleteStoryMutation.mutateAsync({
        story,
      });
    });
    if (!mutationPromise) {
      throw new Error("mutation promise was not created");
    }
    expect(panelQueries.removeStory).toHaveBeenCalledWith(story.id);

    deferred.resolve(new Response(null, { status: 204 }));
    await expect(mutationPromise).resolves.toBeUndefined();
  });

  it("rolls back optimistic bulk status when request fails", async () => {
    const story = buildStory();
    const deferred = deferredResponse();
    const panelQueries = createPanelQueriesMock();
    const setError = vi.fn();
    const showToast = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL): Promise<Response> => {
        const url = String(input);
        if (url === `/api/projects/${PROJECT_ID}/stories/bulk-status`) {
          return deferred.promise;
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        });
      }),
    );

    const { result } = renderHook(
      () =>
        useStoryMutations({
          projectId: PROJECT_ID,
          panelQueries,
          notifySessionExpired: vi.fn(),
          setForbidden: vi.fn(),
          setError,
          showToast,
        }),
      { wrapper: createWrapper() },
    );

    let mutationPromise: Promise<Story[]> | null = null;
    await act(async () => {
      mutationPromise = result.current.bulkStatusMutation.mutateAsync({
        storyIds: [story.id],
        stories: [story],
        status: "Started",
        currentIterationId: CURRENT_ITERATION_ID,
      });
    });
    if (!mutationPromise) {
      throw new Error("mutation promise was not created");
    }
    expect(panelQueries.applyStoriesUpdate).toHaveBeenCalledWith([
      expect.objectContaining({ id: story.id, status: "Started" }),
    ]);

    deferred.resolve(
      new Response(JSON.stringify({ error: "bulk status failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(mutationPromise).rejects.toBeInstanceOf(Error);
    expect(panelQueries.restorePanelsSnapshot).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith("bulk status failed");
    expect(showToast).toHaveBeenCalledWith(
      "error",
      "一括ステータス更新に失敗しました。再度お試しください。",
    );
  });

  it("applies optimistic bulk label immediately", async () => {
    const story = buildStory({ labels: ["existing"] });
    const deferred = deferredResponse();
    const panelQueries = createPanelQueriesMock();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL): Promise<Response> => {
        const url = String(input);
        if (url === `/api/projects/${PROJECT_ID}/stories/bulk-labels`) {
          return deferred.promise;
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        });
      }),
    );

    const { result } = renderHook(
      () =>
        useStoryMutations({
          projectId: PROJECT_ID,
          panelQueries,
          notifySessionExpired: vi.fn(),
          setForbidden: vi.fn(),
          setError: vi.fn(),
          showToast: vi.fn(),
        }),
      { wrapper: createWrapper() },
    );

    let mutationPromise: Promise<Story[]> | null = null;
    await act(async () => {
      mutationPromise = result.current.bulkLabelMutation.mutateAsync({
        storyIds: [story.id],
        stories: [story],
        labelName: "urgent",
      });
    });
    if (!mutationPromise) {
      throw new Error("mutation promise was not created");
    }

    expect(panelQueries.applyStoriesUpdate).toHaveBeenCalledWith([
      expect.objectContaining({
        id: story.id,
        labels: ["existing", "urgent"],
      }),
    ]);

    deferred.resolve(
      new Response(
        JSON.stringify({
          stories: [{ ...story, labels: ["existing", "urgent"] }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    await expect(mutationPromise).resolves.toEqual([
      expect.objectContaining({ labels: ["existing", "urgent"] }),
    ]);
  });
});
