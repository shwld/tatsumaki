import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ProjectCreateCompleteScreen } from "./project-create-complete-screen";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const renderScreen = (path = "/projects/new/complete?request=p1") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthErrorProvider>
        <Routes>
          <Route
            path="/projects/new/complete"
            element={<ProjectCreateCompleteScreen />}
          />
          <Route path="/projects/:projectId" element={<h1>opened</h1>} />
          <Route path="/projects/new" element={<h1>new</h1>} />
        </Routes>
      </AuthErrorProvider>
    </MemoryRouter>,
  );

describe("ProjectCreateCompleteScreen", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("opens the project once the server reports it created", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ status: "created", project: { id: "p1" } }),
    );
    renderScreen();

    expect(await screen.findByText("opened")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/api/project-creation-requests/p1/complete",
      { method: "POST" },
    );
  });

  it("shows a waiting message while the payment is not yet reflected", async () => {
    vi.mocked(fetch).mockResolvedValue(
      json({ status: "pending", state: "suspended" }, 202),
    );
    renderScreen();

    expect((await screen.findByRole("status")).textContent).toContain(
      "反映を確認しています",
    );
    expect(screen.queryByText("opened")).toBeNull();
  });

  it("offers a retry when the server fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: "down" }, 503));
    renderScreen();

    expect(
      await screen.findByRole("button", { name: "もう一度確認" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "作成できませんでした",
    );
  });

  it("reports an unknown request without calling the API", async () => {
    renderScreen("/projects/new/complete");

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("見つかりません"),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not promise creation continues after closing the page", async () => {
    vi.mocked(fetch).mockResolvedValue(
      json({ status: "pending", state: "suspended" }, 202),
    );
    renderScreen();
    await screen.findByRole("status");

    expect(screen.queryByText(/閉じても/)).toBeNull();
  });
});
