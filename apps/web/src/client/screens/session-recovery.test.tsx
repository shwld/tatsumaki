import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetProjectStoryBreadcrumbCacheForTests } from "../components/project-story-breadcrumb";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ToastProvider } from "../contexts/toast-context";
import { StoryMultiPanelScreen } from "./story-multi-panel-screen";

vi.mock("../components/rich-text-editor", () => ({
  RichTextEditor: ({
    value,
    onChange,
    ariaLabel,
    ariaDescribedBy,
    ariaInvalid,
    id,
  }: {
    value: string;
    onChange: (value: string) => void;
    ariaLabel?: string;
    ariaDescribedBy?: string;
    ariaInvalid?: boolean;
    id?: string;
  }) => (
    <textarea
      id={id}
      role="textbox"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid ? "true" : "false"}
    />
  ),
}));

function renderWithProviders(ui: React.ReactElement, { route = "/" } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthErrorProvider>
          <ToastProvider>
            <Routes>
              <Route path="/projects/:projectId/stories" element={ui} />
            </Routes>
          </ToastProvider>
        </AuthErrorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Session expiration recovery", () => {
  beforeEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    resetProjectStoryBreadcrumbCacheForTests();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("shows session expired banner when API returns 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    renderWithProviders(<StoryMultiPanelScreen />, {
      route: "/projects/project-1/stories",
    });

    await waitFor(() => {
      expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
    });

    const loginLink = screen.getByRole("link", { name: /log in again/i });
    expect(loginLink).toHaveAttribute("href", "/cdn-cgi/access/login");
  });

  it("shows permission denied when API returns 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ error: "You do not have access to this project" }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    renderWithProviders(<StoryMultiPanelScreen />, {
      route: "/projects/project-1/stories",
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "権限が不足しています" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("You do not have access to this project"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /log in again/i }),
    ).not.toBeInTheDocument();
  });

  it("saves return URL to sessionStorage on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    renderWithProviders(<StoryMultiPanelScreen />, {
      route: "/projects/project-1/stories",
    });

    await waitFor(() => {
      expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
    });

    expect(sessionStorage.getItem("tatsumaki:returnTo")).toBeTruthy();
  });
});
