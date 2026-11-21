import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthErrorProvider } from "./auth-error-context";
import {
  ProjectBillingScope,
  useProjectReadOnly,
} from "./project-billing-context";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function Probe() {
  return <p>{useProjectReadOnly() ? "read-only" : "editable"}</p>;
}

const renderScope = () =>
  render(
    <MemoryRouter initialEntries={["/projects/p1"]}>
      <AuthErrorProvider>
        <ProjectBillingScope>
          <Probe />
        </ProjectBillingScope>
      </AuthErrorProvider>
    </MemoryRouter>,
  );

const respond = (body: unknown, status = 200) =>
  vi.mocked(fetch).mockResolvedValue(json(body, status));

describe("ProjectBillingScope", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps editing and shows nothing for an active project", async () => {
    respond({ state: "active", role: "member", validUntil: null });
    renderScope();
    expect(await screen.findByText("editable")).toBeTruthy();
    expect(screen.queryByTestId("project-billing-banner")).toBeNull();
  });

  it("shows the grace deadline to the owner and keeps editing", async () => {
    respond({
      state: "grace",
      role: "owner",
      validUntil: "2999-01-02T03:04:00Z",
    });
    renderScope();
    const banner = await screen.findByTestId("project-billing-banner");
    expect(banner.textContent).toContain("支払いに失敗しています");
    expect(banner.textContent).toContain("2999");
    expect(screen.getByText("editable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "支払いを管理" })).toBeTruthy();
  });

  it("shows nothing about payment to a member during grace", async () => {
    respond({ state: "grace", role: "member", validUntil: null });
    renderScope();
    expect(await screen.findByText("editable")).toBeTruthy();
    expect(screen.queryByTestId("project-billing-banner")).toBeNull();
  });

  it("tells every member a suspended project is view only", async () => {
    respond({ state: "suspended", role: "member", validUntil: null });
    renderScope();
    const banner = await screen.findByTestId("project-billing-banner");
    expect(banner.textContent).toContain("停止中・閲覧のみ");
    expect(banner.textContent).toContain("オーナーが行います");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("read-only")).toBeTruthy();
  });

  it("offers the owner a resume button and keeps editing off", async () => {
    respond({ state: "suspended", role: "owner", validUntil: null });
    renderScope();
    await screen.findByTestId("project-billing-banner");
    expect(
      screen.getByRole("button", { name: "プロジェクトを再開" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "支払いを管理" })).toBeTruthy();
    expect(screen.getByText("read-only")).toBeTruthy();
  });

  describe("resuming", () => {
    const assign = vi.fn();
    beforeEach(() => {
      vi.stubGlobal("location", { ...window.location, assign });
    });
    afterEach(() => assign.mockReset());

    const suspendedOwner = () =>
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        if (String(input).endsWith("/resume")) {
          return resumeResponse();
        }
        expect(init?.method).toBeUndefined();
        return json({ state: "suspended", role: "owner", validUntil: null });
      });
    let resumeResponse: () => Response;

    it("sends the owner to checkout for the same project", async () => {
      resumeResponse = () =>
        json({ url: "https://checkout.stripe.com/c/pay/x" }, 201);
      suspendedOwner();
      renderScope();
      fireEvent.click(
        await screen.findByRole("button", { name: "プロジェクトを再開" }),
      );
      await waitFor(() =>
        expect(assign).toHaveBeenCalledWith(
          "https://checkout.stripe.com/c/pay/x",
        ),
      );
      expect(fetch).toHaveBeenCalledWith("/api/billing/projects/p1/resume", {
        method: "POST",
      });
    });

    it("guides to payment repair without leaving when a live subscription needs payment", async () => {
      resumeResponse = () =>
        json({ code: "payment_action_required", error: "x" }, 409);
      suspendedOwner();
      renderScope();
      fireEvent.click(
        await screen.findByRole("button", { name: "プロジェクトを再開" }),
      );
      expect(await screen.findByText(/支払いの確認が必要な購読/)).toBeTruthy();
      expect(assign).not.toHaveBeenCalled();
    });

    it("hides the resume button when new subscriptions are disabled", async () => {
      resumeResponse = () =>
        json({ code: "checkout_disabled", error: "x" }, 409);
      suspendedOwner();
      renderScope();
      fireEvent.click(
        await screen.findByRole("button", { name: "プロジェクトを再開" }),
      );
      expect(
        await screen.findByText(/新しい購読の開始を受け付けていません/),
      ).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "プロジェクトを再開" }),
      ).toBeNull();
      expect(screen.getByRole("button", { name: "支払いを管理" })).toBeTruthy();
    });

    it("shows an error and allows a retry when the request fails", async () => {
      resumeResponse = () => json({ error: "x" }, 503);
      suspendedOwner();
      renderScope();
      fireEvent.click(
        await screen.findByRole("button", { name: "プロジェクトを再開" }),
      );
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(
        (
          screen.getByRole("button", {
            name: "プロジェクトを再開",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    });

    it("waits without opening editing after returning from checkout, then follows the entitlement", async () => {
      vi.useFakeTimers();
      let state = "suspended";
      vi.mocked(fetch).mockImplementation(async () =>
        json({ state, role: "owner", validUntil: null }),
      );
      render(
        <MemoryRouter initialEntries={["/projects/p1?billing=resume"]}>
          <AuthErrorProvider>
            <ProjectBillingScope>
              <Probe />
            </ProjectBillingScope>
          </AuthErrorProvider>
        </MemoryRouter>,
      );
      await act(async () => {});
      expect(screen.getByText(/反映を待っています/)).toBeTruthy();
      expect(screen.getByText("read-only")).toBeTruthy();

      state = "active";
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(screen.getByText("editable")).toBeTruthy();
      expect(screen.queryByTestId("project-billing-banner")).toBeNull();
    });

    it("keeps polling after a transient failure on return from checkout", async () => {
      vi.useFakeTimers();
      let calls = 0;
      vi.mocked(fetch).mockImplementation(async () => {
        calls += 1;
        return calls === 1
          ? json({ error: "x" }, 503)
          : json({ state: "active", role: "owner", validUntil: null });
      });
      render(
        <MemoryRouter initialEntries={["/projects/p1?billing=resume"]}>
          <AuthErrorProvider>
            <ProjectBillingScope>
              <Probe />
            </ProjectBillingScope>
          </AuthErrorProvider>
        </MemoryRouter>,
      );
      await act(async () => {});
      expect(screen.getByText("read-only")).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(screen.getByText("editable")).toBeTruthy();
    });

    it("applies a slow active answer even when polling asks again before it arrives", async () => {
      vi.useFakeTimers();
      let calls = 0;
      vi.mocked(fetch).mockImplementation(async () => {
        calls += 1;
        if (calls === 1) {
          return json({ state: "suspended", role: "owner", validUntil: null });
        }
        await new Promise((resolve) => setTimeout(resolve, 7_000));
        return json({ state: "active", role: "owner", validUntil: null });
      });
      render(
        <MemoryRouter initialEntries={["/projects/p1?billing=resume"]}>
          <AuthErrorProvider>
            <ProjectBillingScope>
              <Probe />
            </ProjectBillingScope>
          </AuthErrorProvider>
        </MemoryRouter>,
      );
      await act(async () => {});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(screen.getByText("editable")).toBeTruthy();
    });

    it("tells the owner nothing was charged after a canceled checkout", async () => {
      respond({ state: "suspended", role: "owner", validUntil: null });
      render(
        <MemoryRouter initialEntries={["/projects/p1?billing=resume-cancel"]}>
          <AuthErrorProvider>
            <ProjectBillingScope>
              <Probe />
            </ProjectBillingScope>
          </AuthErrorProvider>
        </MemoryRouter>,
      );
      expect(await screen.findByText(/完了していません/)).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "プロジェクトを再開" }),
      ).toBeTruthy();
    });
  });

  it("does not show the resume button to members", async () => {
    respond({ state: "suspended", role: "member", validUntil: null });
    renderScope();
    await screen.findByTestId("project-billing-banner");
    expect(
      screen.queryByRole("button", { name: "プロジェクトを再開" }),
    ).toBeNull();
  });

  it("fails closed with a retry when the state cannot be read", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    renderScope();
    expect(await screen.findByText("read-only")).toBeTruthy();
    respond({ state: "active", role: "member", validUntil: null });
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(await screen.findByText("editable")).toBeTruthy();
  });

  it("treats a server error as unknown, not active", async () => {
    respond({ error: "boom" }, 500);
    renderScope();
    expect(await screen.findByText("read-only")).toBeTruthy();
  });

  it("fails closed when the state request is unauthorized or forbidden", async () => {
    respond({ error: "forbidden" }, 403);
    renderScope();
    expect(await screen.findByText("read-only")).toBeTruthy();
  });

  it("follows a state change on an already open screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    respond({ state: "active", role: "member", validUntil: null });
    renderScope();
    expect(await screen.findByText("editable")).toBeTruthy();

    respond({ state: "suspended", role: "member", validUntil: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await waitFor(() => expect(screen.getByText("read-only")).toBeTruthy());
  });

  it("is read-only until the first answer arrives", async () => {
    let release: (r: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );
    renderScope();
    expect(screen.getByText("read-only")).toBeTruthy();
    release(json({ state: "active", role: "member", validUntil: null }));
    expect(await screen.findByText("editable")).toBeTruthy();
  });

  it("ignores a slow earlier answer that arrives after a newer one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let releaseFirst: (r: Response) => void = () => {};
    vi.mocked(fetch)
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          releaseFirst = resolve;
        }),
      )
      .mockResolvedValue(
        json({ state: "suspended", role: "member", validUntil: null }),
      );
    renderScope();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await waitFor(() => expect(screen.getByText("read-only")).toBeTruthy());
    await act(async () => {
      releaseFirst(json({ state: "active", role: "member", validUntil: null }));
    });
    expect(screen.getByText("read-only")).toBeTruthy();
  });

  it("does not fetch outside a project", () => {
    render(
      <MemoryRouter initialEntries={["/projects/new"]}>
        <AuthErrorProvider>
          <ProjectBillingScope>
            <Probe />
          </ProjectBillingScope>
        </AuthErrorProvider>
      </MemoryRouter>,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText("editable")).toBeTruthy();
  });
});
