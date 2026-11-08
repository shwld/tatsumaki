import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ProjectInvitationsScreen } from "./project-invitations-screen";

const buildJsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};

describe("ProjectInvitationsScreen", () => {
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
      <MemoryRouter
        initialEntries={["/projects/project-1/members/invitations"]}
      >
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/members/invitations"
              element={<ProjectInvitationsScreen />}
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

  it("requires an email address", async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildJsonResponse({
        currentMemberRole: "owner",
        members: [],
        invitations: [],
      }),
    );

    render(
      <MemoryRouter
        initialEntries={["/projects/project-1/members/invitations"]}
      >
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/members/invitations"
              element={<ProjectInvitationsScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "招待を送信" }));

    expect(
      screen.getByText("メールアドレスを入力してください"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("ユーザーID")).toBeNull();
  });

  it("shows readable roles, statuses and invitee names", async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildJsonResponse({
        currentMemberRole: "owner",
        members: [
          {
            projectId: "project-1",
            userId: "github|alice",
            role: "member",
            displayName: "Alice",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        invitations: [
          {
            id: "inv-1",
            projectId: "project-1",
            inviterUserId: "github|owner",
            targetUserId: "github|alice",
            targetEmail: null,
            role: "viewer",
            status: "cancelled",
            expiresAt: "2099-01-08T00:00:00.000Z",
            acceptedByUserId: null,
            acceptedAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    render(
      <MemoryRouter
        initialEntries={["/projects/project-1/members/invitations"]}
      >
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/members/invitations"
              element={<ProjectInvitationsScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("招待先: Alice")).toBeInTheDocument();
    expect(
      screen.getByText("権限: 閲覧者 / 状態: 取り消し済み"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/github\|alice/)).toBeNull();
  });

  it("keeps user-ID invitations distinguishable when the invitee has no profile", async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildJsonResponse({
        currentMemberRole: "owner",
        members: [],
        invitations: [
          {
            id: "inv-2",
            projectId: "project-1",
            inviterUserId: "github|owner",
            targetUserId: "github|newcomer",
            targetEmail: null,
            role: "member",
            status: "pending",
            expiresAt: "2099-01-08T00:00:00.000Z",
            acceptedByUserId: null,
            acceptedAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    render(
      <MemoryRouter
        initialEntries={["/projects/project-1/members/invitations"]}
      >
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/members/invitations"
              element={<ProjectInvitationsScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("招待先: 不明なユーザー (github|newcomer)"),
    ).toBeInTheDocument();
  });

  it("creates, copies, and revokes a one-time invitation link", async () => {
    const fetchMock = vi.mocked(fetch);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (!init?.method) {
        return buildJsonResponse({
          currentMemberRole: "owner",
          members: [],
          invitations: [],
        });
      }
      if (init.method === "POST" && url.endsWith("/invitation-links")) {
        return buildJsonResponse(
          {
            invitation: {
              id: "link-1",
              projectId: "project-1",
              inviterUserId: "github|owner",
              targetUserId: null,
              targetEmail: null,
              invitationType: "single_use",
              role: "member",
              status: "pending",
              expiresAt: "2026-01-08T00:00:00.000Z",
              acceptedByUserId: null,
              acceptedAt: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            url: "https://example.com/invite#secret-token",
          },
          201,
        );
      }
      if (init.method === "DELETE" && url.endsWith("/link-1")) {
        return buildJsonResponse({ invitation: { status: "cancelled" } });
      }
      return buildJsonResponse({ error: "unexpected" }, 500);
    });

    render(
      <MemoryRouter
        initialEntries={["/projects/project-1/members/invitations"]}
      >
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/members/invitations"
              element={<ProjectInvitationsScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "1回限りの招待リンクを作成",
      }),
    );
    const linkInput = await screen.findByLabelText("作成した招待リンク");
    expect(linkInput).toHaveValue("https://example.com/invite#secret-token");

    fireEvent.click(screen.getByRole("button", { name: "コピー" }));
    expect(writeText).toHaveBeenCalledWith(
      "https://example.com/invite#secret-token",
    );

    fireEvent.click(screen.getByRole("button", { name: "リンクを無効化" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "リンクを無効化" }),
      ).toBeNull();
    });
  });
});
