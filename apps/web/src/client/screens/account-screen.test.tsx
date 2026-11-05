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

const defaultEntitlementResponse = {
  entitlement: {
    billingAccountId: "github|test-user",
    plan: "free",
    state: "active",
    limits: { maxOwnedProjects: 0 },
    validUntil: null,
    revision: 1,
    cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
  },
};

describe("AccountScreen", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads account data and saves updates", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        buildJsonResponse({
          id: "github|test-user",
          displayName: "tester",
          email: "tester@example.com",
        }),
      )
      .mockResolvedValueOnce(buildJsonResponse(defaultNotificationSettings))
      .mockResolvedValueOnce(buildJsonResponse(defaultEntitlementResponse))
      .mockResolvedValueOnce(
        buildJsonResponse({
          id: "github|test-user",
          displayName: "Test User",
          email: "new@example.com",
        }),
      );

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
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        buildJsonResponse({
          id: "github|test-user",
          displayName: "tester",
          email: "tester@example.com",
        }),
      )
      .mockResolvedValueOnce(buildJsonResponse(defaultNotificationSettings))
      .mockResolvedValueOnce(buildJsonResponse(defaultEntitlementResponse))
      .mockResolvedValueOnce(
        buildJsonResponse(
          {
            error: "入力内容を修正してください",
            errors: {
              email: "有効なメールアドレスを入力してください",
            },
          },
          400,
        ),
      );

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
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({
        id: "github|test-user",
        displayName: "tester",
        email: "tester@example.com",
      }),
    );
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse(defaultNotificationSettings),
    );
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse(defaultEntitlementResponse),
    );

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
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        buildJsonResponse({
          id: "github|test-user",
          displayName: "tester",
          email: "tester@example.com",
        }),
      )
      .mockResolvedValueOnce(buildJsonResponse(defaultNotificationSettings))
      .mockResolvedValueOnce(buildJsonResponse(defaultEntitlementResponse))
      .mockResolvedValueOnce(
        buildJsonResponse({
          ...defaultNotificationSettings,
          emailEnabled: false,
          targetScope: "all_stories",
          notifyOnStatusChanged: false,
          notifyOnComment: true,
          notifyOnEstimate: false,
        }),
      );

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
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        buildJsonResponse({
          id: "github|test-user",
          displayName: "tester",
          email: "tester@example.com",
        }),
      )
      .mockResolvedValueOnce(buildJsonResponse(defaultNotificationSettings))
      .mockResolvedValueOnce(entitlementResponse);

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

  const entitlementWith = (overrides: Record<string, unknown>) =>
    buildJsonResponse({
      entitlement: {
        ...defaultEntitlementResponse.entitlement,
        ...overrides,
      },
    });

  it("shows the free plan and upgrade guidance", async () => {
    renderWithEntitlement(buildJsonResponse(defaultEntitlementResponse));

    expect(await screen.findByText("Free")).toBeInTheDocument();
    expect(screen.getByText("有効")).toBeInTheDocument();
    expect(screen.getByText("0 件")).toBeInTheDocument();
    expect(
      screen.getByText(/プロジェクトを作成するには Pro が必要です/),
    ).toBeInTheDocument();
  });

  it("shows validUntil and ownership guidance during grace", async () => {
    renderWithEntitlement(
      entitlementWith({
        plan: "pro",
        state: "grace",
        limits: { maxOwnedProjects: null },
        validUntil: "2026-12-31T00:00:00.000Z",
      }),
    );

    expect(await screen.findByText("支払い猶予中")).toBeInTheDocument();
    expect(screen.getByText("上限なし")).toBeInTheDocument();
    expect(screen.getByText("期限")).toBeInTheDocument();
    expect(
      screen.getByText(/オーナーとしての権限と既存データの編集は引き続き可能/),
    ).toBeInTheDocument();
  });

  it("shows resume guidance when restricted", async () => {
    renderWithEntitlement(
      entitlementWith({ plan: "pro", state: "restricted" }),
    );

    expect(await screen.findByText("制限中")).toBeInTheDocument();
    expect(screen.getByText(/支払いを再開すると/)).toBeInTheDocument();
  });

  it("falls back when the entitlement is temporarily unavailable", async () => {
    renderWithEntitlement(
      buildJsonResponse(
        { error: "Entitlement is temporarily unavailable" },
        503,
      ),
    );

    expect(
      await screen.findByText(/プラン情報を一時的に取得できません/),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("tester")).toBeInTheDocument();
  });
});
