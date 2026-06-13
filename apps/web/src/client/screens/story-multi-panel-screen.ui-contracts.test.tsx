import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetProjectStoryBreadcrumbCacheForTests } from "../components/project-story-breadcrumb";
import { createStoryMultiPanelFetchMock } from "../test/story-multi-panel/fetch-mock-builder";
import { PROJECT_ID } from "../test/story-multi-panel/fixtures";
import { renderStoryMultiPanel } from "../test/story-multi-panel/render-harness";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ToastProvider } from "../contexts/toast-context";
import { StoryMultiPanelScreen } from "./story-multi-panel-screen";

vi.mock("../components/story-accordion-detail", () => {
  return {
    StoryAccordionDetail: ({ story }: { story: { id: string } }) => (
      <div data-testid={`story-detail-${story.id}`}>detail</div>
    ),
  };
});

describe("StoryMultiPanelScreen UI contracts", () => {
  beforeEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    localStorage.clear();
  });

  afterEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    localStorage.clear();
    vi.unstubAllGlobals();
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new Event("resize"));
  });

  it("shows Current/Backlog by default and keeps Done/Icebox hidden", async () => {
    vi.stubGlobal("fetch", createStoryMultiPanelFetchMock());
    renderStoryMultiPanel();

    expect(await screen.findByText("Backlog story")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("panel-actions-toggle"));
    expect(screen.getByTestId("panel-toggle-Current")).toBeChecked();
    expect(screen.getByTestId("panel-toggle-Backlog")).toBeChecked();
    expect(screen.getByTestId("panel-toggle-Done")).not.toBeChecked();
    expect(screen.getByTestId("panel-toggle-Icebox")).not.toBeChecked();
  });

  it("enables Done panel from actions menu", async () => {
    vi.stubGlobal("fetch", createStoryMultiPanelFetchMock());
    renderStoryMultiPanel();

    expect(await screen.findByText("Backlog story")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("panel-actions-toggle"));
    fireEvent.click(screen.getByTestId("panel-toggle-Done"));

    expect(await screen.findByText("Done story")).toBeInTheDocument();
  });

  it("uses hamburger menu on small screens with accessible expanded state", async () => {
    vi.stubGlobal("fetch", createStoryMultiPanelFetchMock());
    Object.defineProperty(window, "innerWidth", {
      value: 500,
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new Event("resize"));
    renderStoryMultiPanel();

    expect(await screen.findByText("Backlog story")).toBeInTheDocument();
    const toggle = screen.getByTestId("mobile-sub-header-menu-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Project History")).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.getByTestId("mobile-sub-header-menu")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("menuitem", { name: "Project History" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("menuitem", { name: "高度な検索を開く" }),
    );
    await waitFor(() => {
      expect(
        screen.queryByTestId("mobile-sub-header-menu"),
      ).not.toBeInTheDocument();
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles Current/Backlog combined mode and persists it", async () => {
    vi.stubGlobal("fetch", createStoryMultiPanelFetchMock());
    renderStoryMultiPanel();

    expect(await screen.findByText("Backlog story")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("panel-actions-toggle"));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Combine current & backlog" }),
    );

    expect(
      await screen.findByTestId("panel-CurrentBacklogCombined"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("panel-Current")).not.toBeInTheDocument();
    expect(screen.queryByTestId("panel-Backlog")).not.toBeInTheDocument();

    const stored = JSON.parse(
      localStorage.getItem("tatsumaki:current-backlog-view-mode:user-1") ??
        "{}",
    );
    expect(stored.mode).toBe("combined");
  });

  it("does not auto-select a story after inline create", async () => {
    const baseFetch = createStoryMultiPanelFetchMock();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const rawUrl =
          input instanceof Request
            ? input.url.replace(/^https?:\/\/[^/]+/, "")
            : String(input);
        const parsed = new URL(rawUrl, "http://localhost");
        if (
          parsed.pathname === `/api/projects/${PROJECT_ID}/stories` &&
          (init?.method ?? "GET").toUpperCase() === "POST"
        ) {
          return new Response(
            JSON.stringify({
              story: {
                __typename: "Story",
                id: "story-created",
                storyNumber: 99,
                projectId: PROJECT_ID,
                title: "Created story",
                description: "",
                type: "feature",
                status: "Unstarted",
                statusChangedAt: "2026-01-01T00:00:00.000Z",
                storyPoint: null,
                labels: [],
                epicId: null,
                iterationId: null,
                isIcebox: false,
                ownerIds: [],
                requesterId: null,
                releaseDate: null,
                position: 1,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
                blockingStories: [],
                blockedStories: [],
              },
            }),
            { status: 201, headers: { "content-type": "application/json" } },
          );
        }
        return baseFetch(input);
      }),
    );
    renderStoryMultiPanel();

    expect(await screen.findByText("Backlog story")).toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole("button", { name: "+ Add Story" })[0]!,
    );
    await userEvent.type(
      screen.getByPlaceholderText("タイトルを入力"),
      "Created story",
    );
    await userEvent.click(screen.getByRole("button", { name: "作成" }));

    expect(await screen.findByText("Created story")).toBeInTheDocument();
    expect(screen.queryByText("1件を選択中")).not.toBeInTheDocument();
  });

  it("renders fixed poker panel without Story Focus when poker query is present", async () => {
    const baseFetch = createStoryMultiPanelFetchMock();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const rawUrl =
          input instanceof Request
            ? input.url.replace(/^https?:\/\/[^/]+/, "")
            : String(input);
        const method = (
          input instanceof Request ? input.method : (init?.method ?? "GET")
        ).toUpperCase();
        if (
          rawUrl ===
            `/api/projects/${PROJECT_ID}/planning-poker/sessions/active` &&
          method === "GET"
        ) {
          return new Response(
            JSON.stringify({
              session: {
                id: "session-1",
                projectId: PROJECT_ID,
                storyId: "story-started",
                storyTitle: "Current story",
                status: "Open",
                consensusPoint: null,
                createdBy: "user-1",
                revealedAt: null,
                closedAt: null,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
                totalVotes: 0,
                myVotePoint: null,
                votes: [],
                participants: [{ userId: "user-1", connected: true }],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return baseFetch(input, init);
      }),
    );
    renderStoryMultiPanel(
      `/projects/${PROJECT_ID}/stories?poker=story-started`,
    );

    expect(
      (await screen.findAllByText("Planning Poker")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Story Focus")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse" }),
    ).toBeInTheDocument();
  });

  it("hides poker panel when active session does not exist", async () => {
    vi.stubGlobal("fetch", createStoryMultiPanelFetchMock());
    renderStoryMultiPanel(
      `/projects/${PROJECT_ID}/stories?poker=story-started`,
    );

    await waitFor(() => {
      expect(screen.queryByText("Planning Poker")).toBeNull();
    });
  });

  it("stays on multi-panel route when hash points to a loaded story number", async () => {
    vi.stubGlobal("fetch", createStoryMultiPanelFetchMock());
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/stories#2`]}>
          <AuthErrorProvider>
            <ToastProvider>
              <Routes>
                <Route
                  path="/projects/:projectId/stories"
                  element={<StoryMultiPanelScreen />}
                />
                <Route
                  path="/projects/:projectId/stories/:storyNumber"
                  element={<div data-testid="story-detail-route">detail</div>}
                />
              </Routes>
            </ToastProvider>
          </AuthErrorProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Current story")).toBeInTheDocument();
    expect(screen.queryByTestId("story-detail-route")).toBeNull();
    expect(
      await screen.findByTestId("story-detail-story-started"),
    ).toBeInTheDocument();
  });

  it("navigates to story detail route when hash target is not in panel stories", async () => {
    vi.stubGlobal("fetch", createStoryMultiPanelFetchMock());
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/stories#9999`]}>
          <AuthErrorProvider>
            <ToastProvider>
              <Routes>
                <Route
                  path="/projects/:projectId/stories"
                  element={<StoryMultiPanelScreen />}
                />
                <Route
                  path="/projects/:projectId/stories/:storyNumber"
                  element={<div data-testid="story-detail-route">detail</div>}
                />
              </Routes>
            </ToastProvider>
          </AuthErrorProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("story-detail-route")).toBeInTheDocument();
  });

  it("closes poker panel after confirmation", async () => {
    const baseFetch = createStoryMultiPanelFetchMock();
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const rawUrl =
          input instanceof Request
            ? input.url.replace(/^https?:\/\/[^/]+/, "")
            : String(input);
        const method = (
          input instanceof Request ? input.method : (init?.method ?? "GET")
        ).toUpperCase();
        if (
          rawUrl ===
            `/api/projects/${PROJECT_ID}/planning-poker/sessions/active` &&
          method === "GET"
        ) {
          return new Response(
            JSON.stringify({
              session: {
                id: "session-1",
                projectId: PROJECT_ID,
                storyId: "story-started",
                storyTitle: "Current story",
                status: "Open",
                consensusPoint: null,
                createdBy: "user-1",
                revealedAt: null,
                closedAt: null,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
                totalVotes: 0,
                myVotePoint: null,
                votes: [],
                participants: [{ userId: "user-1", connected: true }],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (
          rawUrl ===
            `/api/projects/${PROJECT_ID}/planning-poker/sessions/session-1/close` &&
          method === "POST"
        ) {
          return new Response(JSON.stringify({ session: null }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return baseFetch(input, init);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderStoryMultiPanel(
      `/projects/${PROJECT_ID}/stories?poker=story-started`,
    );

    expect(await screen.findAllByText("Planning Poker")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const rawUrl =
          input instanceof Request
            ? input.url.replace(/^https?:\/\/[^/]+/, "")
            : String(input);
        const method = (
          input instanceof Request ? input.method : (init?.method ?? "GET")
        ).toUpperCase();
        return (
          rawUrl ===
            `/api/projects/${PROJECT_ID}/planning-poker/sessions/session-1/close` &&
          method === "POST"
        );
      }),
    ).toBe(true);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Collapse" })).toBeNull();
    });
  });

  it("sets highest point on reveal tie and shows participant avatars", async () => {
    const baseFetch = createStoryMultiPanelFetchMock();
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const rawUrl =
          input instanceof Request
            ? input.url.replace(/^https?:\/\/[^/]+/, "")
            : String(input);
        const method = (
          input instanceof Request ? input.method : (init?.method ?? "GET")
        ).toUpperCase();
        if (
          rawUrl ===
            `/api/projects/${PROJECT_ID}/planning-poker/sessions/active` &&
          method === "GET"
        ) {
          return new Response(
            JSON.stringify({
              session: {
                id: "session-1",
                projectId: PROJECT_ID,
                storyId: "story-started",
                storyTitle: "Current story",
                status: "Open",
                consensusPoint: null,
                createdBy: "user-1",
                revealedAt: null,
                closedAt: null,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
                totalVotes: 4,
                myVotePoint: null,
                votes: [
                  {
                    userId: "user-1",
                    point: null,
                    revealed: false,
                    updatedAt: "2026-01-01T00:00:00.000Z",
                  },
                  {
                    userId: "user-2",
                    point: null,
                    revealed: false,
                    updatedAt: "2026-01-01T00:00:00.000Z",
                  },
                ],
                participants: [
                  { userId: "user-1", connected: true },
                  { userId: "user-2", connected: true },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (
          rawUrl === `/api/projects/${PROJECT_ID}/members` &&
          method === "GET"
        ) {
          return new Response(
            JSON.stringify({
              members: [
                {
                  userId: "user-1",
                  role: "owner",
                  displayName: "Claude",
                  avatarUrl: null,
                  gravatarUrl: null,
                },
                {
                  userId: "user-2",
                  role: "member",
                  displayName: "shwld",
                  avatarUrl: null,
                  gravatarUrl: null,
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (
          rawUrl ===
            `/api/projects/${PROJECT_ID}/planning-poker/sessions/session-1/reveal` &&
          method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              session: {
                id: "session-1",
                projectId: PROJECT_ID,
                storyId: "story-started",
                storyTitle: "Current story",
                status: "Revealed",
                consensusPoint: null,
                createdBy: "user-1",
                revealedAt: "2026-01-01T00:00:00.000Z",
                closedAt: null,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
                totalVotes: 4,
                myVotePoint: 3,
                votes: [
                  {
                    userId: "user-1",
                    point: 3,
                    revealed: true,
                    updatedAt: "2026-01-01T00:00:00.000Z",
                  },
                  {
                    userId: "user-2",
                    point: 5,
                    revealed: true,
                    updatedAt: "2026-01-01T00:00:00.000Z",
                  },
                  {
                    userId: "user-3",
                    point: 3,
                    revealed: true,
                    updatedAt: "2026-01-01T00:00:00.000Z",
                  },
                  {
                    userId: "user-4",
                    point: 5,
                    revealed: true,
                    updatedAt: "2026-01-01T00:00:00.000Z",
                  },
                ],
                participants: [
                  { userId: "user-1", connected: true },
                  { userId: "user-2", connected: true },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return baseFetch(input, init);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    renderStoryMultiPanel(
      `/projects/${PROJECT_ID}/stories?poker=story-started`,
    );

    expect(await screen.findByLabelText("Claude")).toBeInTheDocument();
    expect(await screen.findByLabelText("shwld")).toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: "Reveal" }),
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveValue("5");
    });
    expect(screen.queryByRole("button", { name: "Reveal" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Revealed" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });
});
