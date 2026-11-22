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
    expect(fetch).toHaveBeenCalledWith("/api/billing/portal", {
      method: "POST",
    });
  });

  it("opens the portal once for a double click and states the customer-wide scope", async () => {
    routeFetch({
      "GET /api/billing/entitlement": hosted,
      "GET /api/billing/subscriptions": emptyList,
      "POST /api/billing/portal": () =>
        json({ url: "https://billing.stripe.com/p/x" }),
    });
    renderSection();

    const button = await screen.findByRole("button", { name: "支払いを管理" });
    expect(screen.getByText(/全プロジェクトの支払いをまとめて/)).toBeTruthy();
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => url === "/api/billing/portal"),
    ).toHaveLength(1);
  });

  it("reloads subscriptions when the page is restored from the back/forward cache", async () => {
    routeFetch({
      "GET /api/billing/entitlement": hosted,
      "GET /api/billing/subscriptions": emptyList,
    });
    renderSection();
    await screen.findByText("所有しているプロジェクトはありません。");
    const count = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => url === "/api/billing/subscriptions")
        .length;
    expect(count()).toBe(1);

    const event = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);

    await waitFor(() => expect(count()).toBe(2));
  });

  it("re-enables the payment button when restored from the back/forward cache", async () => {
    routeFetch({
      "GET /api/billing/entitlement": hosted,
      "GET /api/billing/subscriptions": emptyList,
      "POST /api/billing/portal": () =>
        json({ url: "https://billing.stripe.com/p/x" }),
    });
    renderSection();
    const button = await screen.findByRole("button", { name: "支払いを管理" });
    fireEvent.click(button);
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect((button as HTMLButtonElement).disabled).toBe(true);

    const event = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);

    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
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

  const twoProjects = () =>
    json({
      projects: [
        {
          projectId: "p1",
          projectName: "Alpha",
          entitlementState: "active",
          subscription: {
            lifecycle: "live",
            endsAt: null,
            nextBilling: { status: "none" },
          },
        },
        {
          projectId: "p2",
          projectName: "Beta",
          entitlementState: "active",
          subscription: {
            lifecycle: "ending",
            endsAt: "2026-12-25T12:00:00.000Z",
            nextBilling: { status: "none" },
          },
        },
        {
          projectId: "p3",
          projectName: "Gamma",
          entitlementState: "suspended",
          subscription: {
            lifecycle: "ended",
            endsAt: null,
            nextBilling: { status: "none" },
          },
        },
      ],
    });

  it("offers cancellation only for a live subscription not already scheduled to end", async () => {
    routeFetch({
      "GET /api/billing/entitlement": hosted,
      "GET /api/billing/subscriptions": twoProjects,
    });
    renderSection();

    await screen.findAllByRole("listitem");
    expect(
      screen.getAllByRole("button", { name: /期間末に解約/ }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Alpha の購読を期間末に解約" }),
    ).toBeTruthy();
  });

  it("sends only the project id to start the cancellation and follows the returned URL", async () => {
    routeFetch({
      "GET /api/billing/entitlement": hosted,
      "GET /api/billing/subscriptions": twoProjects,
      "POST /api/billing/projects/p1/cancel": () =>
        json({ url: "https://billing.stripe.com/p/session/cancel" }, 201),
    });
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "Alpha の購読を期間末に解約" }),
    );

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        "https://billing.stripe.com/p/session/cancel",
      ),
    );
    expect(fetch).toHaveBeenCalledWith("/api/billing/projects/p1/cancel", {
      method: "POST",
    });
  });

  it("does not claim the subscription is canceled when the session cannot be created", async () => {
    routeFetch({
      "GET /api/billing/entitlement": hosted,
      "GET /api/billing/subscriptions": twoProjects,
      "POST /api/billing/projects/p1/cancel": () =>
        json({ error: "down" }, 503),
    });
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "Alpha の購読を期間末に解約" }),
    );

    expect(
      await screen.findByText(/解約の確認画面を開けませんでした/),
    ).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    expect(screen.queryByText(/終了予定日: 2026\/12\/2[^5]/)).toBeNull();
  });

  it("reloads the list when the subscription state had already changed", async () => {
    let listCalls = 0;
    routeFetch({
      "GET /api/billing/entitlement": hosted,
      "GET /api/billing/subscriptions": () => {
        listCalls += 1;
        return twoProjects();
      },
      "POST /api/billing/projects/p1/cancel": () =>
        json({ error: "x", code: "already_scheduled" }, 409),
    });
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "Alpha の購読を期間末に解約" }),
    );

    expect(
      await screen.findByText(/購読の状態が変わっていました/),
    ).toBeTruthy();
    await waitFor(() => expect(listCalls).toBe(2));
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
