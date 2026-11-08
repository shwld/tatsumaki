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

  const renderScreen = () =>
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

  it("shows display names and readable roles instead of user IDs, and links to invitations", async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildJsonResponse({
        currentMemberRole: "owner",
        members: [
          {
            projectId: "project-1",
            userId: "github|alice",
            role: "owner",
            displayName: "Alice",
            avatarUrl: null,
            gravatarUrl: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            projectId: "project-1",
            userId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
            role: "viewer",
            displayName: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        invitations: [],
      }),
    );

    renderScreen();

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("不明なユーザー")).toBeInTheDocument();
    expect(screen.getByDisplayValue("オーナー")).toBeInTheDocument();
    expect(screen.getByDisplayValue("閲覧者")).toBeInTheDocument();
    expect(screen.queryByText(/github\|alice/)).toBeNull();
    expect(screen.getByText("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "招待を管理" })).toHaveAttribute(
      "href",
      "/projects/project-1/members/invitations",
    );
    expect(screen.queryByText("メンバーを招待")).toBeNull();
  });

  it("disables role management for non-owner", async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildJsonResponse({
        currentMemberRole: "member",
        members: [
          {
            projectId: "project-1",
            userId: "github|owner",
            role: "owner",
            displayName: "Owner",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        invitations: [],
      }),
    );

    renderScreen();

    expect(await screen.findByDisplayValue("オーナー")).toBeDisabled();
  });

  it("updates a member role and keeps the profile", async () => {
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "PATCH") {
        return buildJsonResponse({
          member: {
            projectId: "project-1",
            userId: "github|bob",
            role: "viewer",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        });
      }
      return buildJsonResponse({
        currentMemberRole: "owner",
        members: [
          {
            projectId: "project-1",
            userId: "github|bob",
            role: "member",
            displayName: "Bob",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        invitations: [],
      });
    });

    renderScreen();

    fireEvent.change(await screen.findByDisplayValue("メンバー"), {
      target: { value: "viewer" },
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("閲覧者")).toBeInTheDocument();
    });
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });
});
