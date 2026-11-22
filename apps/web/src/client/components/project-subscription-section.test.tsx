import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ProjectSubscriptionSection } from "./project-subscription-section";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const renderSection = (search = "") =>
  render(
    <MemoryRouter initialEntries={[`/projects/p1/settings${search}`]}>
      <AuthErrorProvider>
        <ProjectSubscriptionSection projectId="p1" />
      </AuthErrorProvider>
    </MemoryRouter>,
  );

const entry = (projectId: string, endsAt: string | null = null) => ({
  projectId,
  projectName: projectId,
  entitlementState: "active",
  subscription: {
    status: "active",
    endsAt,
    nextBilling: { status: "none" },
  },
});

describe("ProjectSubscriptionSection", () => {
  const assign = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("location", { ...window.location, assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    assign.mockReset();
  });

  it("renders nothing on a self-hosted deployment", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ mode: "self-hosted" }));
    const { container } = renderSection();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.textContent).toBe(""));
    expect(fetch).not.toHaveBeenCalledWith("/api/billing/subscriptions");
  });

  it("shows only this project's subscription and cancels only it", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ mode: "control-plane" }))
      .mockResolvedValueOnce(json({ projects: [entry("p2"), entry("p1")] }))
      .mockResolvedValueOnce(
        json({ url: "https://billing.stripe.com/cancel" }, 201),
      );
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "期間末に解約" }),
    );

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://billing.stripe.com/cancel"),
    );
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/billing/projects/p1/cancel?from=settings",
      { method: "POST" },
    );
  });

  it("opens the payment method update and states the shared scope", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ mode: "control-plane" }))
      .mockResolvedValueOnce(json({ projects: [entry("p1")] }))
      .mockResolvedValueOnce(
        json({ url: "https://billing.stripe.com/pm" }, 201),
      );
    renderSection();

    expect(
      await screen.findByText(/全プロジェクトの購読の支払い/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "支払い方法を更新" }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://billing.stripe.com/pm"),
    );
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/billing/projects/p1/payment-method",
      { method: "POST" },
    );
  });

  it("hides the cancel button once a cancellation is scheduled", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ mode: "control-plane" }))
      .mockResolvedValueOnce(
        json({ projects: [entry("p1", "2026-12-25T12:00:00.000Z")] }),
      );
    renderSection();

    expect(await screen.findByText(/終了予定日/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "期間末に解約" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "支払い方法を更新" }),
    ).toBeTruthy();
  });

  it("shows no subscription and no actions for a project without one", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ mode: "control-plane" }))
      .mockResolvedValueOnce(
        json({ projects: [{ ...entry("p1"), subscription: null }] }),
      );
    renderSection();

    expect(await screen.findByText(/有効な購読はありません/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "期間末に解約" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "支払い方法を更新" }),
    ).toBeNull();
  });

  it("does not claim cancellation when the session cannot be created", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ mode: "control-plane" }))
      .mockResolvedValueOnce(json({ projects: [entry("p1")] }))
      .mockResolvedValueOnce(json({ error: "down" }, 503));
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "期間末に解約" }),
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    expect(screen.queryByText(/終了予定日/)).toBeNull();
  });

  it("refetches when the server says the state changed", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ mode: "control-plane" }))
      .mockResolvedValueOnce(json({ projects: [entry("p1")] }))
      .mockResolvedValueOnce(json({ code: "already_scheduled" }, 409))
      .mockResolvedValueOnce(json({ mode: "control-plane" }))
      .mockResolvedValueOnce(
        json({ projects: [entry("p1", "2026-12-25T12:00:00.000Z")] }),
      );
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "期間末に解約" }),
    );

    expect(await screen.findByText(/終了予定日/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "期間末に解約" })).toBeNull();
  });

  it("shows the return notice after coming back from Stripe", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ mode: "control-plane" }))
      .mockResolvedValueOnce(json({ projects: [entry("p1")] }));
    renderSection("?billing=cancel");
    expect(await screen.findByText(/Stripe の画面から戻りました/)).toBeTruthy();
  });
});
