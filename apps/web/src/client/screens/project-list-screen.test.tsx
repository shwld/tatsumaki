import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ProjectListScreen } from "./project-list-screen";

const buildJsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};

describe("ProjectListScreen", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows empty state and navigates to create screen in one click", async () => {
    vi.mocked(fetch).mockResolvedValue(buildJsonResponse({ projects: [] }));

    render(
      <MemoryRouter initialEntries={["/projects"]}>
        <AuthErrorProvider>
          <Routes>
            <Route path="/projects" element={<ProjectListScreen />} />
            <Route path="/projects/new" element={<h1>プロジェクトを作成</h1>} />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("プロジェクトがまだありません"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("link", { name: "プロジェクトを作成" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "プロジェクトを作成" }),
      ).toBeInTheDocument();
    });
  });

  it("shows fetch error and does not show empty-state call-to-action", async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildJsonResponse({ error: "Projects fetch failed" }, 500),
    );

    render(
      <MemoryRouter initialEntries={["/projects"]}>
        <AuthErrorProvider>
          <Routes>
            <Route path="/projects" element={<ProjectListScreen />} />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Projects fetch failed",
      );
    });
    expect(
      screen.queryByRole("link", { name: "プロジェクトを作成" }),
    ).not.toBeInTheDocument();
  });

  it("shows 403 recovery guidance and retries without leaving the screen", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        buildJsonResponse(
          { error: "このプロジェクト一覧を表示する権限がありません。" },
          403,
        ),
      )
      .mockResolvedValueOnce(buildJsonResponse({ projects: [] }));

    render(
      <MemoryRouter initialEntries={["/projects"]}>
        <AuthErrorProvider>
          <Routes>
            <Route path="/projects" element={<ProjectListScreen />} />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "権限が不足しています" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("このプロジェクト一覧を表示する権限がありません。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "プロジェクト一覧の閲覧権限を申請するか、管理者に必要なプロジェクトへの追加を依頼してください。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/session has expired/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "プロジェクト一覧を再読み込み" }),
    ).toHaveClass("w-full", "min-h-11");

    fireEvent.click(
      screen.getByRole("button", { name: "プロジェクト一覧を再読み込み" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("プロジェクトがまだありません"),
      ).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows retry button on 500 error and recovers after retry", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        buildJsonResponse({ error: "Internal Server Error" }, 500),
      )
      .mockResolvedValueOnce(
        buildJsonResponse({
          projects: [{ id: "p1", name: "My Project", sprintDurationDays: 14 }],
        }),
      );

    render(
      <MemoryRouter initialEntries={["/projects"]}>
        <AuthErrorProvider>
          <Routes>
            <Route path="/projects" element={<ProjectListScreen />} />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Internal Server Error",
      );
    });
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "再試行" }));

    await waitFor(() => {
      expect(screen.getByText("My Project")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows retry button on network error and recovers after retry", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        buildJsonResponse({
          projects: [{ id: "p1", name: "My Project", sprintDurationDays: 14 }],
        }),
      );

    render(
      <MemoryRouter initialEntries={["/projects"]}>
        <AuthErrorProvider>
          <Routes>
            <Route path="/projects" element={<ProjectListScreen />} />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "プロジェクト一覧の読み込みに失敗しました",
      );
    });
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "再試行" }));

    await waitFor(() => {
      expect(screen.getByText("My Project")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
