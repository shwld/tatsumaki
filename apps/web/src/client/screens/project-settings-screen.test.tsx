import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ToastProvider } from "../contexts/toast-context";
import { ProjectSettingsScreen } from "./project-settings-screen";
import { resetProjectStoryBreadcrumbCacheForTests } from "../components/project-story-breadcrumb";

const mockProject = {
  id: "p1",
  name: "Test Project",
  description: "desc",
  isPublic: false,
  timezone: "Asia/Tokyo",
  sprintDurationDays: 14,
  pointScaleType: "fibonacci",
  customPointScale: null,
  estimateBugs: false,
  estimateChores: false,
  iterationStartDay: 1,
  currentUserRole: "owner",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/projects/p1/settings"]}>
      <AuthErrorProvider>
        <ToastProvider>
          <Routes>
            <Route
              path="/projects/:projectId/settings"
              element={<ProjectSettingsScreen />}
            />
            <Route path="/projects" element={<p>Projects Screen</p>} />
          </Routes>
        </ToastProvider>
      </AuthErrorProvider>
    </MemoryRouter>,
  );
}

describe("ProjectSettingsScreen", () => {
  beforeEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading state then project settings", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/projects/p1") && !url.includes("/projects/")) {
        // Breadcrumb fetch for /api/projects
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ project: mockProject }), {
        status: 200,
      });
    });

    renderScreen();

    expect(screen.getByText("読み込み中...")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "プロジェクト設定" }),
      ).toBeInTheDocument();
    });

    expect(screen.getByLabelText("プロジェクト名")).toHaveValue("Test Project");
  });

  it("shows error on fetch failure", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByText("プロジェクトの読み込みに失敗しました"),
      ).toBeInTheDocument();
    });
  });

  it("shows link to API key management screen", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/projects/p1") && !url.includes("/projects/")) {
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ project: mockProject }), {
        status: 200,
      });
    });

    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "APIキー管理を開く" }),
      ).toHaveAttribute("href", "/projects/p1/api-keys");
    });
  });

  it("hides API key management link for non-owner", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/projects/p1") && !url.includes("/projects/")) {
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          project: { ...mockProject, currentUserRole: "member" },
        }),
        { status: 200 },
      );
    });

    renderScreen();

    await waitFor(() => {
      expect(
        screen.queryByRole("link", { name: "APIキー管理を開く" }),
      ).not.toBeInTheDocument();
    });
  });

  it("submits delete request only when confirmation name matches", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (
        url.includes("/api/projects/p1") &&
        !url.includes("/projects/") &&
        (!init || !("method" in init) || init.method !== "DELETE")
      ) {
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      }
      if (url.endsWith("/api/projects/p1") && init?.method === "DELETE") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ project: mockProject }), {
        status: 200,
      });
    });

    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "プロジェクトを削除する" }),
      ).toBeInTheDocument();
    });

    const submitButton = screen.getByRole("button", {
      name: "プロジェクトを削除する",
    });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("確認用プロジェクト名"), {
      target: { value: "Wrong Name" },
    });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("確認用プロジェクト名"), {
      target: { value: "Test Project" },
    });
    expect(submitButton).not.toBeDisabled();
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/p1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Projects Screen")).toBeInTheDocument();
    });
  });

  it("shows specific error message when project is not found on delete", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (
        url.includes("/api/projects/p1") &&
        !url.includes("/projects/") &&
        (!init || !("method" in init) || init.method !== "DELETE")
      ) {
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      }
      if (url.endsWith("/api/projects/p1") && init?.method === "DELETE") {
        return new Response(
          JSON.stringify({
            error: "Project not found",
            code: "project_not_found",
          }),
          { status: 404 },
        );
      }
      return new Response(JSON.stringify({ project: mockProject }), {
        status: 200,
      });
    });

    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "プロジェクトを削除する" }),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("確認用プロジェクト名"), {
      target: { value: "Test Project" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "プロジェクトを削除する" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "対象プロジェクトが見つかりません。既に削除されている可能性があります。",
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows specific error message when project name mismatch on delete", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (
        url.includes("/api/projects/p1") &&
        !url.includes("/projects/") &&
        (!init || !("method" in init) || init.method !== "DELETE")
      ) {
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      }
      if (url.endsWith("/api/projects/p1") && init?.method === "DELETE") {
        return new Response(
          JSON.stringify({
            error: "Project name does not match",
            code: "project_name_mismatch",
          }),
          { status: 400 },
        );
      }
      return new Response(JSON.stringify({ project: mockProject }), {
        status: 200,
      });
    });

    renderScreen();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "プロジェクトを削除する" }),
      ).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("確認用プロジェクト名"), {
      target: { value: "Test Project" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "プロジェクトを削除する" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("確認用のプロジェクト名が一致しません"),
      ).toBeInTheDocument();
    });
  });

  it("shows specific error message when delete is forbidden", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (
        url.includes("/api/projects/p1") &&
        !url.includes("/projects/") &&
        (!init || !("method" in init) || init.method !== "DELETE")
      ) {
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      }
      if (url.endsWith("/api/projects/p1") && init?.method === "DELETE") {
        return new Response(
          JSON.stringify({
            error: "Only project owners can delete this project.",
          }),
          { status: 403 },
        );
      }
      return new Response(JSON.stringify({ project: mockProject }), {
        status: 200,
      });
    });

    renderScreen();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "プロジェクトを削除する" }),
      ).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("確認用プロジェクト名"), {
      target: { value: "Test Project" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "プロジェクトを削除する" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "プロジェクトを削除する権限がありません。オーナーに依頼してください。",
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows generic error message when delete fails unexpectedly", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (
        url.includes("/api/projects/p1") &&
        !url.includes("/projects/") &&
        (!init || !("method" in init) || init.method !== "DELETE")
      ) {
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      }
      if (url.endsWith("/api/projects/p1") && init?.method === "DELETE") {
        return new Response(JSON.stringify({ error: "Unexpected failure" }), {
          status: 500,
        });
      }
      return new Response(JSON.stringify({ project: mockProject }), {
        status: 200,
      });
    });

    renderScreen();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "プロジェクトを削除する" }),
      ).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("確認用プロジェクト名"), {
      target: { value: "Test Project" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "プロジェクトを削除する" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("プロジェクトの削除に失敗しました"),
      ).toBeInTheDocument();
    });
  });
});
