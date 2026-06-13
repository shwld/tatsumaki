import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Layout } from "./layout";
import { i18n, LANGUAGE_STORAGE_KEY } from "../i18n/config";

describe("Layout", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
    void i18n.changeLanguage("ja");
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders app title and children", () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(null), { status: 401 }),
    );

    render(
      <MemoryRouter>
        <Layout>
          <p>content</p>
        </Layout>
      </MemoryRouter>,
    );

    expect(screen.getByText("tatsumaki")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("displays user info when authenticated", async () => {
    const user = {
      id: "u1",
      email: "test@example.com",
      displayName: "Taro",
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(user), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <Layout>
          <p>main</p>
        </Layout>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "ユーザーメニュー" }),
      ).toBeInTheDocument();
    });

    const trigger = screen.getByRole("button", { name: "ユーザーメニュー" });
    await userEvent.click(trigger);
    expect(await screen.findByText("テーマ")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "ログアウト" }),
    ).toHaveAttribute("href", "/cdn-cgi/access/logout");
  });

  it("hides user section when not authenticated", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

    render(
      <MemoryRouter>
        <Layout>
          <p>main</p>
        </Layout>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "ユーザーメニュー" }),
      ).not.toBeInTheDocument();
    });
  });

  it("opens notification panel and lists notifications", async () => {
    const user = {
      id: "u1",
      email: "test@example.com",
      displayName: "Taro",
    };

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/auth/me") {
        return new Response(JSON.stringify(user), { status: 200 });
      }
      if (url.includes("/api/auth/me/notifications?")) {
        return new Response(
          JSON.stringify({
            notifications: [
              {
                __typename: "Notification",
                id: "activity:1",
                projectId: "p1",
                kind: "status_changed",
                storyId: "story-1",
                storyTitle: "通知対象ストーリー",
                invitationId: null,
                actorUserId: "u2",
                actorName: "Hanako",
                createdAt: "2026-04-25T09:00:00.000Z",
                message: "Started -> Finished",
                readAt: null,
              },
            ],
            page: {
              nextCursor: null,
              hasNext: false,
            },
          }),
          { status: 200 },
        );
      }
      if (url === "/api/auth/me/notifications/read") {
        return new Response(JSON.stringify({ updatedCount: 1 }), {
          status: 200,
        });
      }
      return new Response(null, { status: 404 });
    });

    render(
      <MemoryRouter initialEntries={["/projects/p1/stories"]}>
        <Layout>
          <p>main</p>
        </Layout>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "ユーザーメニュー" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "通知" }));

    await waitFor(() => {
      expect(screen.getByText("通知対象ストーリー")).toBeInTheDocument();
    });

    expect(screen.getByText("Hanako")).toBeInTheDocument();
  });

  it("shows invitation notification link to accept screen", async () => {
    const user = {
      id: "u1",
      email: "test@example.com",
      displayName: "Taro",
    };

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/auth/me") {
        return new Response(JSON.stringify(user), { status: 200 });
      }
      if (url.includes("/api/auth/me/notifications?")) {
        return new Response(
          JSON.stringify({
            notifications: [
              {
                __typename: "Notification",
                id: "invite:1",
                projectId: "p1",
                kind: "member_invitation",
                storyId: null,
                storyTitle: null,
                invitationId: "inv-1",
                actorUserId: "u2",
                actorName: "Hanako",
                createdAt: "2026-04-25T09:00:00.000Z",
                message: "プロジェクト招待が届いています",
                readAt: null,
              },
            ],
            page: {
              nextCursor: null,
              hasNext: false,
            },
          }),
          { status: 200 },
        );
      }
      if (url === "/api/auth/me/notifications/read") {
        return new Response(JSON.stringify({ updatedCount: 1 }), {
          status: 200,
        });
      }
      return new Response(null, { status: 404 });
    });

    render(
      <MemoryRouter initialEntries={["/account"]}>
        <Layout>
          <p>main</p>
        </Layout>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "ユーザーメニュー" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "通知" }));

    const link = await screen.findByRole("link", { name: "招待を確認する" });
    expect(link).toHaveAttribute(
      "href",
      "/projects/p1/invitations/inv-1/accept",
    );
  });

  it("switches language immediately and persists selection", async () => {
    const user = {
      id: "u1",
      email: "test@example.com",
      displayName: "Taro",
    };

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(user), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <Layout>
          <p>main</p>
        </Layout>
      </MemoryRouter>,
    );

    const trigger = await screen.findByRole("button", {
      name: "ユーザーメニュー",
    });
    await userEvent.click(trigger);
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "English" }),
    );

    await waitFor(() => {
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    });
    expect(
      screen.getByRole("button", { name: "User menu" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "User menu" }));
    const languageLabel = screen.getByText("Language");
    const themeLabel = screen.getByText("Theme");
    const englishItem = screen.getByRole("menuitemradio", {
      name: "English",
    });
    const lightItem = screen.getByRole("menuitemradio", { name: "Light" });
    expect(languageLabel.compareDocumentPosition(englishItem)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(englishItem.compareDocumentPosition(themeLabel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(themeLabel.compareDocumentPosition(lightItem)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByRole("menuitem", { name: "Logout" })).toHaveAttribute(
      "href",
      "/cdn-cgi/access/logout",
    );
  });
});
