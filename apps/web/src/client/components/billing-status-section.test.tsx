import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { BillingStatusSection } from "./billing-status-section";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const renderSection = () =>
  render(
    <MemoryRouter initialEntries={["/account"]}>
      <AuthErrorProvider>
        <BillingStatusSection />
      </AuthErrorProvider>
    </MemoryRouter>,
  );

describe("BillingStatusSection", () => {
  const assign = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("location", { ...window.location, assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    assign.mockReset();
  });

  it("shows no limits for a self-hosted deployment and no payment button", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ mode: "self-hosted", checkoutEnabled: false }),
    );
    renderSection();

    expect(
      await screen.findByText("このサービスには利用上限がありません。"),
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  const routeFetch = (routes: Record<string, () => Response>) =>
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const key = `${init?.method ?? "GET"} ${String(input)}`;
      const handler = routes[key];
      if (!handler) throw new Error(`unexpected fetch ${key}`);
      return handler();
    });

  const hosted = () => json({ mode: "control-plane", checkoutEnabled: true });
  const emptyList = () => json({ projects: [] });

  it("opens the billing portal for a hosted deployment", async () => {
    routeFetch({
      "GET /api/billing/entitlement": hosted,
      "GET /api/billing/subscriptions": emptyList,
      "POST /api/billing/portal": () =>
        json({ url: "https://billing.stripe.com/p/x" }),
    });
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "支払いを管理" }),
    );

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://billing.stripe.com/p/x"),
    );
    expect(fetch).toHaveBeenLastCalledWith("/api/billing/portal", {
      method: "POST",
    });
  });

  it("shows an error when the portal cannot be opened", async () => {
    routeFetch({
      "GET /api/billing/entitlement": hosted,
      "GET /api/billing/subscriptions": emptyList,
      "POST /api/billing/portal": () => json({ error: "down" }, 503),
    });
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "支払いを管理" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "処理を開始できませんでした",
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("lists each owned project with its state, next billing and end date", async () => {
    routeFetch({
      "GET /api/billing/entitlement": hosted,
      "GET /api/billing/subscriptions": () =>
        json({
          projects: [
            {
              projectId: "p1",
              projectName: "Alpha",
              entitlementState: "active",
              subscription: {
                endsAt: null,
                nextBilling: {
                  status: "scheduled",
                  date: "2026-12-19T12:00:00.000Z",
                  amount: 3850,
                  currency: "jpy",
                },
              },
            },
            {
              projectId: "p2",
              projectName: "Beta",
              entitlementState: "active",
              subscription: {
                endsAt: "2026-12-25T12:00:00.000Z",
                nextBilling: { status: "none" },
              },
            },
            {
              projectId: "p3",
              projectName: "Gamma",
              entitlementState: "grace",
              subscription: {
                endsAt: null,
                nextBilling: { status: "unavailable" },
              },
            },
            {
              projectId: "p4",
              projectName: "Delta",
              entitlementState: "suspended",
              subscription: null,
            },
          ],
        }),
    });
    renderSection();

    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(rows[0]?.textContent).toContain("Alpha");
    expect(rows[0]?.textContent).toContain("利用中");
    expect(rows[0]?.textContent).toContain("2026/12/19");
    expect(rows[0]?.textContent).toContain("￥3,850");
    expect(rows[1]?.textContent).toContain("次回請求: なし");
    expect(rows[1]?.textContent).toContain("終了予定日: 2026/12/25");
    expect(rows[2]?.textContent).toContain("支払い猶予中");
    expect(rows[2]?.textContent).toContain("次回請求: 取得できません");
    expect(rows[3]?.textContent).toContain("停止中");
    expect(rows[3]?.textContent).toContain("購読なし");
  });

  it("shows an empty state when the user owns no projects", async () => {
    routeFetch({
      "GET /api/billing/entitlement": hosted,
      "GET /api/billing/subscriptions": emptyList,
    });
    renderSection();

    expect(
      await screen.findByText("所有しているプロジェクトはありません。"),
    ).toBeTruthy();
  });

  it("does not show free or zero-yen when subscriptions cannot be loaded, and retries", async () => {
    let calls = 0;
    routeFetch({
      "GET /api/billing/entitlement": hosted,
      "GET /api/billing/subscriptions": () => {
        calls += 1;
        return calls === 1
          ? json({ error: "down" }, 503)
          : json({
              projects: [
                {
                  projectId: "p1",
                  projectName: "Alpha",
                  entitlementState: "active",
                  subscription: null,
                },
              ],
            });
      },
    });
    renderSection();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "購読状況を取得できません",
    );
    expect(screen.queryByText(/購読なし|￥0|Free/)).toBeNull();
    expect(screen.getByRole("button", { name: "支払いを管理" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "再取得" }));

    expect(await screen.findByText("Alpha")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an unavailable notice when the status cannot be loaded", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: "down" }, 503));
    renderSection();

    expect((await screen.findByRole("status")).textContent).toContain(
      "一時的に取得できません",
    );
  });
});
