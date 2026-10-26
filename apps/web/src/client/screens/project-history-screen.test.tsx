import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ToastProvider } from "../contexts/toast-context";
import { ProjectHistoryScreen } from "./project-history-screen";

const PROJECT_ID = "project-1";

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/history`]}>
        <AuthErrorProvider>
          <ToastProvider>
            <Routes>
              <Route
                path="/projects/:projectId/history"
                element={<ProjectHistoryScreen />}
              />
            </Routes>
          </ToastProvider>
        </AuthErrorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectHistoryScreen", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows heading", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/history")) {
        return new Response(
          JSON.stringify({ history: [], hasMore: false, nextCursor: null }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    });

    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Project History" }),
      ).toBeInTheDocument();
    });
  });

  it("shows empty state when no history", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/history")) {
        return new Response(
          JSON.stringify({ history: [], hasMore: false, nextCursor: null }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    });

    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByText("まだ操作履歴がありません。"),
      ).toBeInTheDocument();
    });
  });

  it("shows history entries", async () => {
    const mockHistory = [
      {
        __typename: "ProjectHistoryEntry",
        id: "act-1",
        storyId: "story-1",
        storyTitle: "Set up authentication",
        actorUserId: "user-1",
        actorName: "user@example.com",
        action: "created",
        fieldName: "story",
        oldValue: null,
        newValue: "Set up authentication",
        createdAt: "2026-01-03T10:00:00.000Z",
      },
      {
        __typename: "ProjectHistoryEntry",
        id: "act-2",
        storyId: "story-1",
        storyTitle: "Set up authentication",
        actorUserId: "user-1",
        actorName: "user@example.com",
        action: "field_changed",
        fieldName: "status",
        oldValue: "Unstarted",
        newValue: "Started",
        createdAt: "2026-01-04T10:00:00.000Z",
      },
    ];

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/history")) {
        return new Response(
          JSON.stringify({
            history: mockHistory,
            hasMore: false,
            nextCursor: null,
          }),
          {
            status: 200,
          },
        );
      }
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    });

    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByText("Set up authentication")).not.toHaveLength(0);
    });

    expect(screen.getAllByText("不明なユーザー")).toHaveLength(2);
    expect(screen.getByText("作成")).toBeInTheDocument();
    expect(screen.getByText("ステータス を変更")).toBeInTheDocument();
  });

  it("shows member avatars and falls back to initials for departed users", async () => {
    const base = {
      __typename: "ProjectHistoryEntry",
      storyId: "story-1",
      storyTitle: "Story",
      action: "created",
      fieldName: "story",
      oldValue: null,
      newValue: "Story",
      createdAt: "2026-01-03T10:00:00.000Z",
    };
    const mockHistory = [
      { ...base, id: "act-1", actorUserId: "user-1", actorName: "Alice" },
      { ...base, id: "act-2", actorUserId: null, actorName: "Zed Left" },
    ];

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/history")) {
        return new Response(
          JSON.stringify({
            history: mockHistory,
            hasMore: false,
            nextCursor: null,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/members")) {
        return new Response(
          JSON.stringify({
            members: [
              {
                userId: "user-1",
                displayName: "Alice",
                profileResolved: true,
                avatarUrl: "https://example.com/alice.png",
                gravatarUrl: null,
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    });

    renderScreen();

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Alice" })).toHaveAttribute(
        "src",
        "https://example.com/alice.png",
      );
    });
    expect(screen.getByLabelText("Zed Left")).toHaveTextContent("ZL");
  });

  it("shows error on fetch failure", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/history")) {
        return new Response(null, { status: 500 });
      }
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    });

    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByText("プロジェクト履歴の取得に失敗しました"),
      ).toBeInTheDocument();
    });
  });
});
