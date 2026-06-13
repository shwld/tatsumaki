import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ProjectVelocityScreen } from "./project-velocity-screen";

const buildJsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};

const today = new Date();
const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const offsetDate = (days: number) => {
  const next = new Date(today);
  next.setDate(today.getDate() + days);
  return formatDate(next);
};

describe("ProjectVelocityScreen", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows completed iterations, recent average velocity, and chart", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (input === "/api/projects/p1/iterations") {
        return buildJsonResponse({
          iterations: [
            {
              __typename: "Iteration",
              id: "it-1",
              projectId: "p1",
              startDate: offsetDate(-28),
              endDate: offsetDate(-14),
              totalPoints: 8,
              createdAt: "2026-03-01T00:00:00.000Z",
              updatedAt: "2026-03-15T00:00:00.000Z",
            },
            {
              __typename: "Iteration",
              id: "it-2",
              projectId: "p1",
              startDate: offsetDate(-14),
              endDate: offsetDate(-1),
              totalPoints: 13,
              createdAt: "2026-03-15T00:00:00.000Z",
              updatedAt: "2026-03-29T00:00:00.000Z",
            },
            {
              __typename: "Iteration",
              id: "it-current",
              projectId: "p1",
              startDate: offsetDate(-1),
              endDate: offsetDate(14),
              totalPoints: 5,
              createdAt: "2026-03-29T00:00:00.000Z",
              updatedAt: "2026-04-12T00:00:00.000Z",
            },
          ],
          velocity: 9,
        });
      }

      if (
        input ===
        "/api/projects/p1/stories?iterationId=it-current&isIcebox=false"
      ) {
        return buildJsonResponse({
          stories: [
            {
              __typename: "Story",
              id: "s1",
              projectId: "p1",
              title: "accepted",
              description: "accepted",
              type: "feature",
              status: "Accepted",
              statusChangedAt: "2026-03-29T00:00:00.000Z",
              storyPoint: 5,
              labels: [],
              iterationId: "it-current",
              isIcebox: false,
              ownerIds: [],
              requesterId: null,
              position: 1,
              createdAt: "2026-03-29T00:00:00.000Z",
              updatedAt: "2026-03-29T00:00:00.000Z",
            },
            {
              __typename: "Story",
              id: "s2",
              projectId: "p1",
              title: "in progress",
              description: "in progress",
              type: "bug",
              status: "Started",
              statusChangedAt: "2026-03-29T00:00:00.000Z",
              storyPoint: 3,
              labels: [],
              iterationId: "it-current",
              isIcebox: false,
              ownerIds: [],
              requesterId: null,
              position: 2,
              createdAt: "2026-03-29T00:00:00.000Z",
              updatedAt: "2026-03-29T00:00:00.000Z",
            },
          ],
        });
      }

      if (input === "/api/projects/p1/iterations/it-current/burndown") {
        return buildJsonResponse({
          iterationId: "it-current",
          startDate: offsetDate(-1),
          endDate: offsetDate(14),
          burndownScopePoints: 8,
          days: [
            {
              date: offsetDate(-1),
              idealRemaining: 8,
              actualRemaining: 7,
              scopeTotalPoints: 8,
            },
            {
              date: offsetDate(0),
              idealRemaining: 6,
              actualRemaining: 5,
              scopeTotalPoints: 8,
            },
            {
              date: offsetDate(1),
              idealRemaining: 4,
              actualRemaining: null,
              scopeTotalPoints: 10,
            },
          ],
        });
      }

      if (input === "/api/projects") {
        return buildJsonResponse({
          projects: [{ id: "p1", name: "Velocity Project" }],
        });
      }

      return buildJsonResponse({}, 404);
    });

    render(
      <MemoryRouter initialEntries={["/projects/p1/velocity"]}>
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/velocity"
              element={<ProjectVelocityScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "ベロシティダッシュボード" }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("21")).toBeInTheDocument();
    expect(
      screen.getAllByText(`${offsetDate(-14)} 〜 ${offsetDate(-1)}`).length,
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText("ベロシティ推移チャート")).toBeInTheDocument();
    expect(screen.getByLabelText("スプリント進捗サマリー")).toBeInTheDocument();
    expect(screen.getByText("5 pt")).toBeInTheDocument();
    expect(screen.getByText("1 件")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "進捗チャート（現在イテレーション）",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("バーンダウンチャート（理想線と実績線）"),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "バーンダウン" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "バーンアップ" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(
      screen.getByText("注: 未来日の実績線は未確定のため表示されません。"),
    ).toBeInTheDocument();
  });

  it("shows empty state when no iterations are completed yet", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (input === "/api/projects/p1/iterations") {
        return buildJsonResponse({
          iterations: [
            {
              __typename: "Iteration",
              id: "it-current",
              projectId: "p1",
              startDate: "2099-04-01",
              endDate: "2099-04-15",
              totalPoints: 0,
              createdAt: "2099-04-01T00:00:00.000Z",
              updatedAt: "2099-04-01T00:00:00.000Z",
            },
          ],
          velocity: 10,
        });
      }

      if (input === "/api/projects") {
        return buildJsonResponse({
          projects: [{ id: "p1", name: "Velocity Project" }],
        });
      }

      return buildJsonResponse({}, 404);
    });

    render(
      <MemoryRouter initialEntries={["/projects/p1/velocity"]}>
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/velocity"
              element={<ProjectVelocityScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "まだ完了したイテレーションがありません。完了後に実績がここへ表示されます。",
        ),
      ).toBeInTheDocument();
    });
  });
});
