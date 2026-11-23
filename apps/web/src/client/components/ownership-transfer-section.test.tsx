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
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
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
        expect.objectContaining({ method: "POST" }),
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
});
