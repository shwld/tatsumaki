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

  it("opens the billing portal for a hosted deployment", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({ mode: "control-plane", checkoutEnabled: true }),
      )
      .mockResolvedValueOnce(json({ url: "https://billing.stripe.com/p/x" }));
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
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({ mode: "control-plane", checkoutEnabled: true }),
      )
      .mockResolvedValueOnce(json({ error: "down" }, 503));
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "支払いを管理" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "処理を開始できませんでした",
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows an unavailable notice when the status cannot be loaded", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: "down" }, 503));
    renderSection();

    expect((await screen.findByRole("status")).textContent).toContain(
      "一時的に取得できません",
    );
  });
});
