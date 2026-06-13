import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ProjectMembersScreen } from "./project-members-screen";

const buildJsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};

describe("ProjectMembersScreen", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates an invitation by email", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (!init?.method) {
        return buildJsonResponse({
          currentMemberRole: "owner",
          members: [
            {
              projectId: "project-1",
              userId: "github|owner",
              role: "owner",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          invitations: [],
        });
      }

      if (init.method === "POST" && url.endsWith("/invitations")) {
        return buildJsonResponse(
          {
            invitation: {
              id: "inv-1",
              projectId: "project-1",
              inviterUserId: "github|owner",
              targetUserId: null,
              targetEmail: "new-user@example.com",
              role: "member",
              status: "pending",
              expiresAt: "2026-01-08T00:00:00.000Z",
              acceptedByUserId: null,
              acceptedAt: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
          201,
        );
      }

      return buildJsonResponse({ error: "unexpected" }, 500);
    });

    render(
      <MemoryRouter initialEntries={["/projects/project-1/members"]}>
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/members"
              element={<ProjectMembersScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("メンバーを招待")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "new-user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "招待を送信" }));

    await waitFor(() => {
      expect(screen.getByText(/new-user@example\.com/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/invitations",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "new-user@example.com",
          role: "member",
        }),
      }),
    );
  });

  it("shows validation error when both email and user ID are provided", async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildJsonResponse({
        currentMemberRole: "owner",
        members: [],
        invitations: [],
      }),
    );

    render(
      <MemoryRouter initialEntries={["/projects/project-1/members"]}>
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/members"
              element={<ProjectMembersScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("メンバーを招待")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "new-user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("ユーザーID"), {
      target: { value: "github|new-user" },
    });
    fireEvent.click(screen.getByRole("button", { name: "招待を送信" }));

    expect(
      screen.getByText(
        "メールアドレスまたはユーザーIDのどちらか一方を入力してください",
      ),
    ).toBeInTheDocument();
  });

  it("disables role management for non-owner and shows permission guidance", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (_input, init) => {
      if (!init?.method) {
        return buildJsonResponse({
          currentMemberRole: "member",
          members: [
            {
              projectId: "project-1",
              userId: "github|owner",
              role: "owner",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          invitations: [],
        });
      }

      if (init.method === "POST") {
        return buildJsonResponse(
          {
            error:
              "Only project owners can invite members. Ask an owner to send this invitation.",
          },
          403,
        );
      }

      return buildJsonResponse({ error: "unexpected" }, 500);
    });

    render(
      <MemoryRouter initialEntries={["/projects/project-1/members"]}>
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/members"
              element={<ProjectMembersScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("メンバー")).toBeInTheDocument();
    });

    const memberRoleSelect = screen.getByDisplayValue("owner");
    expect(memberRoleSelect).toBeDisabled();

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "blocked@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "招待を送信" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Only project owners can invite members. Ask an owner to send this invitation.",
        ),
      ).toBeInTheDocument();
    });
  });
});
