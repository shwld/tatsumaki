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

const entitlement = (
  overrides: Partial<{
    plan: string;
    state: string;
    maxOwnedProjects: number | null;
  }> = {},
) => ({
  billingAccountId: "user-1",
  plan: overrides.plan ?? "free",
  state: overrides.state ?? "active",
  limits: { maxOwnedProjects: overrides.maxOwnedProjects ?? 0 },
  validUntil: null,
  revision: 1,
  cache: { maxAgeSeconds: 60, staleIfErrorSeconds: 300 },
});

const renderSection = (path = "/account") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthErrorProvider>
        <BillingStatusSection />
      </AuthErrorProvider>
    </MemoryRouter>,
  );

describe("BillingStatusSection actions", () => {
  const assign = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("location", { ...window.location, assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    assign.mockReset();
  });

  it("redirects a free user to Stripe Checkout", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({ entitlement: entitlement(), checkoutEnabled: true }),
      )
      .mockResolvedValueOnce(json({ url: "https://checkout.stripe.com/x" }));
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "Pro にアップグレード" }),
    );

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/x");
    });
    expect(vi.mocked(fetch).mock.calls[1]).toEqual([
      "/api/billing/checkout",
      { method: "POST" },
    ]);
  });

  it("hides the upgrade button while checkout is disabled", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ entitlement: entitlement(), checkoutEnabled: false }),
    );
    renderSection();

    expect(await screen.findByText("Pro プランは準備中です。")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Pro にアップグレード" }),
    ).toBeNull();
  });

  it("redirects a Pro user to the billing portal", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({
          entitlement: entitlement({ plan: "pro", maxOwnedProjects: null }),
          checkoutEnabled: false,
        }),
      )
      .mockResolvedValueOnce(json({ url: "https://billing.stripe.com/p" }));
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "支払いを管理" }),
    );

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("https://billing.stripe.com/p");
    });
  });

  it("offers a resume path to restricted users", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      json({
        entitlement: entitlement({ plan: "pro", state: "restricted" }),
        checkoutEnabled: true,
      }),
    );
    renderSection();

    expect(
      await screen.findByRole("button", { name: "支払いを再開" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Pro にアップグレード" }),
    ).toBeNull();
  });

  it("shows an error when the session cannot be created", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({ entitlement: entitlement(), checkoutEnabled: true }),
      )
      .mockResolvedValueOnce(json({ error: "x" }, 503));
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "Pro にアップグレード" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "処理を開始できませんでした",
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("polls the entitlement after checkout until Pro is reflected", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({ entitlement: entitlement(), checkoutEnabled: true }),
      )
      .mockResolvedValueOnce(
        json({
          entitlement: entitlement({ plan: "pro", maxOwnedProjects: null }),
          checkoutEnabled: true,
        }),
      );
    renderSection("/account?checkout=success");

    expect(
      await screen.findByText("お支払いの反映を確認しています..."),
    ).toBeVisible();
    await vi.advanceTimersByTimeAsync(2000);

    expect(
      await screen.findByText("Pro プランへのアップグレードが完了しました。"),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps polling after a transient entitlement failure", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({ entitlement: entitlement(), checkoutEnabled: true }),
      )
      .mockResolvedValueOnce(json({ error: "x" }, 503))
      .mockResolvedValueOnce(
        json({
          entitlement: entitlement({ plan: "pro", maxOwnedProjects: null }),
          checkoutEnabled: true,
        }),
      );
    renderSection("/account?checkout=success");

    await screen.findByText("お支払いの反映を確認しています...");
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    expect(
      await screen.findByText("Pro プランへのアップグレードが完了しました。"),
    ).toBeVisible();
  });

  it("keeps the last entitlement when the final poll fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({ entitlement: entitlement(), checkoutEnabled: true }),
      )
      .mockResolvedValue(json({ error: "x" }, 503));
    renderSection("/account?checkout=success");

    await screen.findByText("お支払いの反映を確認しています...");
    await vi.advanceTimersByTimeAsync(2000 * 15);

    expect(await screen.findByText(/反映に時間がかかっています/)).toBeVisible();
    expect(screen.getByText("Free")).toBeVisible();
  });
});
