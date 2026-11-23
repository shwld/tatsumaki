import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { OwnershipTransferSection } from "./ownership-transfer-section";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const members = {
  currentMemberRole: "owner",
  members: [
    { projectId: "p1", userId: "owner", role: "owner", displayName: "Olive" },
    { projectId: "p1", userId: "bob", role: "member", displayName: "Bob" },
  ],
  invitations: [],
};

const routes = (
  transfer: unknown,
  mode = "control-plane",
  extra: Record<string, () => Response> = {},
) => {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const key = `${init?.method ?? "GET"} ${url}`;
    if (extra[key]) return extra[key]();
    if (url === "/api/billing/entitlement") return json({ mode });
    if (url === "/api/auth/me") return json({ id: "owner" });
    if (url === "/api/projects/p1/members") return json(members);
    if (url === "/api/billing/projects/p1/ownership-transfer") {
      return json({ transfer });
    }
    return json({ ok: true });
  });
};

const renderSection = (isOwner: boolean) =>
  render(
    <MemoryRouter>
      <AuthErrorProvider>
        <OwnershipTransferSection projectId="p1" isOwner={isOwner} />
      </AuthErrorProvider>
    </MemoryRouter>,
  );

const pendingTransfer = (role: "requester" | "recipient") => ({
  id: "t1",
  fromUserId: "owner",
  toUserId: "bob",
  expiresAt: "2030-01-08T00:00:00.000Z",
  role,
  state: "pending",
});

describe("OwnershipTransferSection", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing on a self-hosted deployment", async () => {
    routes(null, "self-hosted");
    const { container } = renderSection(true);
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("renders nothing for a non-owner without a transfer", async () => {
    routes(null);
    const { container } = renderSection(false);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("lets the owner nominate a member after seeing the subscription notice", async () => {
    routes(null, "control-plane", {
      "POST /api/billing/projects/p1/ownership-transfer": () =>
        json({ transfer: pendingTransfer("requester") }, 201),
    });
    renderSection(true);

    const select = await screen.findByLabelText("譲渡先のメンバー");
    expect(screen.getByText(/あなたの購読は終了します/)).toBeTruthy();
    fireEvent.change(select, { target: { value: "bob" } });
    fireEvent.click(screen.getByRole("button", { name: "譲渡を申請する" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/billing/projects/p1/ownership-transfer",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ toUserId: "bob" }),
        }),
      ),
    );
  });

  it("shows the requester the pending request and lets them cancel", async () => {
    routes(pendingTransfer("requester"));
    renderSection(true);

    expect(
      await screen.findByText(/Bob さんに所有権の譲渡を申請中/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "申請を取り消す" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/billing/projects/p1/ownership-transfer/cancel",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ transferId: "t1" }),
        }),
      ),
    );
  });

  it("shows the recipient the request and lets them decline", async () => {
    routes(pendingTransfer("recipient"));
    renderSection(false);

    expect(
      await screen.findByText(/Olive さんから所有権の譲渡を申請/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "辞退する" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/billing/projects/p1/ownership-transfer/decline",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it.each([
    ["processing", "requester", /Bob さんに移しました.*日割り返金を処理/],
    ["processing", "recipient", /あなたがオーナーになりました/],
    ["completed", "requester", /Bob さんに譲渡しました.*返金しました/],
    ["completed", "recipient", /所有権の譲渡が完了しました/],
    ["review", "requester", /返金を自動では処理できませんでした/],
    ["review", "recipient", /運営が確認しています/],
  ] as const)("shows the %s state to the %s without any action", async (transferState, role, text) => {
    routes({ ...pendingTransfer(role), state: transferState });
    renderSection(role === "requester");

    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "申請を取り消す" })).toBeNull();
    expect(screen.queryByRole("button", { name: "辞退する" })).toBeNull();
  });

  it("tells the recipient their payment was not refunded when the transfer did not go through", async () => {
    routes({
      ...pendingTransfer("recipient"),
      state: "review",
      outcome: "not-switched",
    });
    renderSection(false);
    expect(
      await screen.findByText(/返金を自動では処理できませんでした/),
    ).toBeTruthy();
    expect(screen.queryByText(/所有権を .* に移しました/)).toBeNull();
  });

  it("lets the new owner start another transfer after one completed", async () => {
    routes({
      ...pendingTransfer("recipient"),
      state: "completed",
      outcome: "switched",
    });
    renderSection(true);
    expect(await screen.findByText(/所有権の譲渡が完了しました/)).toBeTruthy();
    expect(await screen.findByLabelText("譲渡先のメンバー")).toBeTruthy();
  });

  it("does not offer a new transfer to a member who is no longer the owner", async () => {
    routes({
      ...pendingTransfer("requester"),
      state: "completed",
      outcome: "switched",
    });
    renderSection(false);
    expect(await screen.findByText(/譲渡しました/)).toBeTruthy();
    expect(screen.queryByLabelText("譲渡先のメンバー")).toBeNull();
  });

  it("asks the page to refresh permissions when it first sees the ownership switch", async () => {
    let current: unknown = {
      ...pendingTransfer("recipient"),
      recipientSubscribed: false,
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/billing/entitlement")
        return json({ mode: "control-plane" });
      if (url === "/api/auth/me") return json({ id: "bob" });
      if (url === "/api/projects/p1/members") return json(members);
      return json({ transfer: current });
    });
    const onSwitched = vi.fn();
    const view = render(
      <MemoryRouter>
        <AuthErrorProvider>
          <OwnershipTransferSection
            projectId="p1"
            isOwner={false}
            onOwnershipSwitched={onSwitched}
          />
        </AuthErrorProvider>
      </MemoryRouter>,
    );
    await screen.findByText(/月額 3,850 円/);
    expect(onSwitched).not.toHaveBeenCalled();

    current = {
      ...pendingTransfer("recipient"),
      state: "processing",
      outcome: "switched",
    };
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(onSwitched).toHaveBeenCalledTimes(1));
    view.unmount();
  });

  it("refreshes permissions when the very first response already shows the switch", async () => {
    routes({
      ...pendingTransfer("recipient"),
      state: "completed",
      outcome: "switched",
    });
    const onSwitched = vi.fn();
    render(
      <MemoryRouter>
        <AuthErrorProvider>
          <OwnershipTransferSection
            projectId="p1"
            isOwner={false}
            onOwnershipSwitched={onSwitched}
          />
        </AuthErrorProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(onSwitched).toHaveBeenCalledTimes(1));
  });

  it("does not refresh permissions when the role already matches the switch", async () => {
    routes({
      ...pendingTransfer("recipient"),
      state: "completed",
      outcome: "switched",
    });
    const onSwitched = vi.fn();
    render(
      <MemoryRouter>
        <AuthErrorProvider>
          <OwnershipTransferSection
            projectId="p1"
            isOwner={true}
            onOwnershipSwitched={onSwitched}
          />
        </AuthErrorProvider>
      </MemoryRouter>,
    );
    await screen.findByText(/所有権の譲渡が完了しました/);
    expect(onSwitched).not.toHaveBeenCalled();
  });

  it("explains a rejected request from a non-payer", async () => {
    routes(null, "control-plane", {
      "POST /api/billing/projects/p1/ownership-transfer": () =>
        json({ code: "no_subscription" }, 409),
    });
    renderSection(true);
    fireEvent.change(await screen.findByLabelText("譲渡先のメンバー"), {
      target: { value: "bob" },
    });
    fireEvent.click(screen.getByRole("button", { name: "譲渡を申請する" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("支払者ではない"),
    );
  });

  it("lets the recipient start the Checkout for the pending request", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, search: "" });
    routes(
      {
        ...pendingTransfer("recipient"),
        recipientSubscribed: false,
        checkout: "available",
      },
      "control-plane",
      {
        "POST /api/billing/projects/p1/ownership-transfer/checkout": () =>
          json({ url: "https://checkout.stripe.test/s" }, 201),
      },
    );
    renderSection(false);

    expect(await screen.findByText(/3,850 円/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "購読して引き継ぐ" }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/s"),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/billing/projects/p1/ownership-transfer/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ transferId: "t1" }),
      }),
    );
  });

  it("does not offer the Checkout again once the recipient's subscription is confirmed", async () => {
    routes({ ...pendingTransfer("recipient"), recipientSubscribed: true });
    renderSection(false);

    expect(await screen.findByText(/購読を確認しました/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "購読して引き継ぐ" })).toBe(
      null,
    );
  });

  it("explains when new subscriptions are paused", async () => {
    routes(
      {
        ...pendingTransfer("recipient"),
        recipientSubscribed: false,
        checkout: "available",
      },
      "control-plane",
      {
        "POST /api/billing/projects/p1/ownership-transfer/checkout": () =>
          json({ code: "checkout_disabled" }, 409),
      },
    );
    renderSection(false);
    fireEvent.click(
      await screen.findByRole("button", { name: "購読して引き継ぐ" }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("停止"),
    );
  });

  it("hides the decline button once the recipient's subscription is confirmed", async () => {
    routes({ ...pendingTransfer("recipient"), recipientSubscribed: true });
    renderSection(false);

    await screen.findByText(/購読を確認しました/);
    expect(screen.queryByRole("button", { name: "辞退する" })).toBe(null);
  });

  it("keeps checking the subscription without the Checkout return URL", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let subscribed = false;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/api/billing/entitlement")
          return json({ mode: "control-plane" });
        if (url === "/api/auth/me") return json({ id: "bob" });
        if (url === "/api/projects/p1/members") return json(members);
        return json({
          transfer: {
            ...pendingTransfer("recipient"),
            recipientSubscribed: subscribed,
            checkout: "available",
          },
        });
      });
      renderSection(false);
      await screen.findByRole("button", { name: "購読して引き継ぐ" });

      subscribed = true;
      await vi.advanceTimersByTimeAsync(3500);

      expect(await screen.findByText(/購読を確認しました/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not offer the Checkout while subscriptions for transfers are not open yet", async () => {
    routes({
      ...pendingTransfer("recipient"),
      recipientSubscribed: false,
      checkout: "disabled",
    });
    renderSection(false);

    await screen.findByRole("button", { name: "辞退する" });
    expect(screen.getByText(/3,850 円/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "購読して引き継ぐ" })).toBe(
      null,
    );
  });

  it("tells the recipient to wait while their subscription for another request is refunded", async () => {
    routes({
      ...pendingTransfer("recipient"),
      recipientSubscribed: false,
      checkout: "otherSubscription",
    });
    renderSection(false);

    expect(await screen.findByText(/その購読が解約されると/)).toBeTruthy();
    expect(screen.queryByText(/3,850 円/)).toBe(null);
    expect(screen.queryByRole("button", { name: "購読して引き継ぐ" })).toBe(
      null,
    );
    expect(screen.getByRole("button", { name: "辞退する" })).toBeTruthy();
  });
});
