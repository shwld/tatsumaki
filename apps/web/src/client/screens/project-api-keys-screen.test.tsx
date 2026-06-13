import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ProjectApiKeysScreen } from "./project-api-keys-screen";

const buildJsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};

describe("ProjectApiKeysScreen", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows API key list", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/projects/") && url.includes("/api-keys")) {
        return buildJsonResponse({
          apiKeys: [
            {
              id: "key-1",
              projectId: "project-1",
              name: "CLI Key",
              keyPrefix: "tsk_live_abc",
              scopes: ["story:write"],
              lastUsedAt: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      }
      if (url.endsWith("/api/projects")) {
        return buildJsonResponse({
          projects: [
            { id: "project-1", name: "Project One", sprintDurationDays: 14 },
          ],
        });
      }
      return buildJsonResponse({ error: "unexpected" }, 500);
    });

    render(
      <MemoryRouter initialEntries={["/projects/project-1/api-keys"]}>
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/api-keys"
              element={<ProjectApiKeysScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("CLI Key")).toBeInTheDocument();
    });
    expect(screen.getByText("prefix: tsk_live_abc")).toBeInTheDocument();
    expect(screen.getByText("scope: story:write")).toBeInTheDocument();
  });

  it("issues API key and shows raw key once", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (_input, init) => {
      if (!init?.method) {
        return buildJsonResponse({ apiKeys: [] });
      }
      if (init.method === "POST") {
        return buildJsonResponse(
          {
            apiKey: {
              id: "key-2",
              projectId: "project-1",
              name: "Automation Key",
              keyPrefix: "tsk_live_xyz",
              scopes: ["story:write"],
              lastUsedAt: null,
              createdAt: "2026-01-02T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z",
            },
            rawKey: "tsk_live_raw_secret",
          },
          201,
        );
      }
      return buildJsonResponse({ error: "unexpected" }, 500);
    });

    render(
      <MemoryRouter initialEntries={["/projects/project-1/api-keys"]}>
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/api-keys"
              element={<ProjectApiKeysScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("既存のAPIキー")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("キー名"), {
      target: { value: "Automation Key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "発行" }));

    await waitFor(() => {
      expect(screen.getByText("tsk_live_raw_secret")).toBeInTheDocument();
    });
    expect(screen.getByText("Automation Key")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/api-keys",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Automation Key",
          scopes: ["story:write"],
        }),
      }),
    );
  });

  it("revokes API key", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (!init?.method) {
        return buildJsonResponse({
          apiKeys: [
            {
              id: "key-3",
              projectId: "project-1",
              name: "Old Key",
              keyPrefix: "tsk_live_old",
              scopes: ["story:write"],
              lastUsedAt: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      }
      if (init.method === "DELETE" && url.endsWith("/api-keys/key-3")) {
        return new Response(null, { status: 204 });
      }
      return buildJsonResponse({ error: "unexpected" }, 500);
    });

    render(
      <MemoryRouter initialEntries={["/projects/project-1/api-keys"]}>
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/api-keys"
              element={<ProjectApiKeysScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Old Key")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "失効" }));

    await waitFor(() => {
      expect(screen.queryByText("Old Key")).not.toBeInTheDocument();
    });
  });

  it("shows permission denied for non-owner", async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildJsonResponse(
        { error: "Only project owners can manage API keys." },
        403,
      ),
    );

    render(
      <MemoryRouter initialEntries={["/projects/project-1/api-keys"]}>
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/api-keys"
              element={<ProjectApiKeysScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Only project owners can manage API keys."),
      ).toBeInTheDocument();
    });
  });
});
