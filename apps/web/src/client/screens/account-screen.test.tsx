import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { AccountScreen } from "./account-screen";

const buildJsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};

const defaultNotificationSettings = {
  userId: "github|test-user",
  emailEnabled: true,
  targetScope: "assigned_only",
  notifyOnStatusChanged: true,
  notifyOnComment: true,
  notifyOnEstimate: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const defaultUsageModeResponse = {
  mode: "control-plane",
};

const defaultAccount = {
  id: "github|test-user",
  displayName: "tester",
  email: "tester@example.com",
};

type FetchRoutes = Record<string, () => Response>;

const stubFetchRoutes = (overrides: FetchRoutes = {}) => {
  const routes: FetchRoutes = {
    "GET /api/auth/me": () => buildJsonResponse(defaultAccount),
    "GET /api/auth/me/notification-settings": () =>
      buildJsonResponse(defaultNotificationSettings),
    "GET /api/usage/mode": () => buildJsonResponse(defaultUsageModeResponse),
    ...overrides,
  };
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockImplementation(async (input, init) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    const route = routes[key];
    if (!route) throw new Error(`Unmocked fetch: ${key}`);
    return route();
  });
  return fetchMock;
};

describe("AccountScreen", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads account data and saves updates", async () => {
    const fetchMock = stubFetchRoutes({
      "PATCH /api/auth/me": () =>
        buildJsonResponse({
          ...defaultAccount,
          displayName: "Test User",
          email: "new@example.com",
        }),
    });

    render(
      <MemoryRouter initialEntries={["/account"]}>
        <AuthErrorProvider>
          <Routes>
            <Route path="/account" element={<AccountScreen />} />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("tester")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("表示名"), {
      target: { value: "Test User" },
    });
    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: "Test User",
          email: "new@example.com",
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Test User")).toBeInTheDocument();
      expect(screen.getByDisplayValue("new@example.com")).toBeInTheDocument();
    });
  });

  it("shows validation errors returned by the API", async () => {
    stubFetchRoutes({
      "PATCH /api/auth/me": () =>
        buildJsonResponse(
          {
            error: "入力内容を修正してください",
            errors: {
              email: "有効なメールアドレスを入力してください",
            },
          },
          400,
        ),
    });

    render(
      <MemoryRouter initialEntries={["/account"]}>
        <AuthErrorProvider>
          <Routes>
            <Route path="/account" element={<AccountScreen />} />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("tester")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "invalid" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "保存する" }));

    await waitFor(() => {
      expect(
        screen.getByText("有効なメールアドレスを入力してください"),
      ).toBeInTheDocument();
    });
  });

  it("shows Cloudflare Access password reset and re-auth links", async () => {
    stubFetchRoutes();

    render(
      <MemoryRouter initialEntries={["/account"]}>
        <AuthErrorProvider>
          <Routes>
            <Route path="/account" element={<AccountScreen />} />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("tester")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("link", { name: "パスワードリセットを開始" }),
    ).toHaveAttribute("href", "/cdn-cgi/access/login");
    expect(
      screen.getByRole("link", { name: "再認証して変更" }),
    ).toHaveAttribute("href", "/cdn-cgi/access/logout");
  });

  it("loads and saves notification settings", async () => {
    const fetchMock = stubFetchRoutes({
      "PATCH /api/auth/me/notification-settings": () =>
        buildJsonResponse({
          ...defaultNotificationSettings,
          emailEnabled: false,
          targetScope: "all_stories",
          notifyOnStatusChanged: false,
          notifyOnComment: true,
          notifyOnEstimate: false,
        }),
    });

    render(
      <MemoryRouter initialEntries={["/account"]}>
        <AuthErrorProvider>
          <Routes>
            <Route path="/account" element={<AccountScreen />} />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("tester")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("メール通知を有効にする"));
    fireEvent.change(screen.getByLabelText("通知対象"), {
      target: { value: "all_stories" },
    });
    fireEvent.click(screen.getByLabelText("ステータス変更"));
    fireEvent.click(screen.getByLabelText("見積もり"));
    fireEvent.click(screen.getByRole("button", { name: "通知設定を保存する" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/me/notification-settings",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            emailEnabled: false,
            targetScope: "all_stories",
            notifyOnStatusChanged: false,
            notifyOnComment: true,
            notifyOnEstimate: false,
          }),
        },
      );
    });
  });
  const renderWithEntitlement = (entitlementResponse: Response) => {
    stubFetchRoutes({
      "GET /api/usage/mode": () => entitlementResponse,
    });

    render(
      <MemoryRouter initialEntries={["/account"]}>
        <AuthErrorProvider>
          <Routes>
            <Route path="/account" element={<AccountScreen />} />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>,
    );
  };

  it("shows the usage of owned projects on a hosted deployment", async () => {
    renderWithEntitlement(buildJsonResponse(defaultUsageModeResponse));

    expect(
      await screen.findByTestId("owned-project-usage"),
    ).toBeInTheDocument();
  });

  it("shows no operation when self-hosted", async () => {
    renderWithEntitlement(buildJsonResponse({ mode: "self-hosted" }));

    expect(
      await screen.findByText("このサービスには利用上限がありません。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "アカウント全体の管理" }),
    ).not.toBeInTheDocument();
  });

  it("falls back when the entitlement is temporarily unavailable", async () => {
    renderWithEntitlement(
      buildJsonResponse(
        { error: "Entitlement is temporarily unavailable" },
        503,
      ),
    );

    expect(
      await screen.findByText(/利用状態を一時的に取得できません/),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("tester")).toBeInTheDocument();
  });

  it("routes an entitlement 401 through session recovery", async () => {
    renderWithEntitlement(buildJsonResponse({ error: "Unauthorized" }, 401));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByText(/利用状態を一時的に取得できません/),
    ).not.toBeInTheDocument();
  });
});
