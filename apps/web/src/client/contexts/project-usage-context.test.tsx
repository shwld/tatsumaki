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
import { ProjectUsageScope, useProjectReadOnly } from "./project-usage-context";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function Probe() {
  return <p>{useProjectReadOnly() ? "read-only" : "editable"}</p>;
}

const renderScope = (path = "/projects/p1") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthErrorProvider>
        <ProjectUsageScope>
          <Probe />
        </ProjectUsageScope>
      </AuthErrorProvider>
    </MemoryRouter>,
  );

const operationsList = (
  operations: string[],
  operationsAvailable = true,
  notice: unknown = null,
) => ({
  operationsAvailable,
  accountOperations: [],
  projects: [
    {
      projectId: "p1",
      projectName: "P",
      access: { kind: "read_only" },
      operations,
      notice,
    },
  ],
});

let usageAnswer: () => Response;
let operationsAnswer: () => Response;
let startAnswer: () => Response;

const answer = (usage: unknown, operations = operationsList([])) => {
  usageAnswer = () => json(usage);
  operationsAnswer = () => json(operations);
};

const readOnlyOwner = { access: { kind: "read_only" }, role: "owner" };

describe("ProjectUsageScope", () => {
  const assign = vi.fn();

  beforeEach(() => {
    startAnswer = () => json({ url: "https://provider.example/s" }, 201);
    vi.stubGlobal("location", { ...window.location, assign });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") return startAnswer();
        return String(input).startsWith("/api/billing/operations")
          ? operationsAnswer()
          : usageAnswer();
      }),
    );
  });
  afterEach(() => {
    assign.mockReset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps editing and shows nothing for an available project", async () => {
    answer({ access: { kind: "available" }, role: "member" });
    renderScope();
    expect(await screen.findByText("editable")).toBeTruthy();
    expect(screen.queryByTestId("project-usage-banner")).toBeNull();
  });

  it.each([
    ["ending", "この日時で利用が終了し"],
    ["action_required", "期限までに手続きすると利用を続けられます"],
  ])("shows an %s deadline to the owner and keeps editing", async (untilReason, text) => {
    answer(
      {
        access: {
          kind: "limited",
          until: "2999-01-02T03:04:00Z",
          untilReason,
        },
        role: "owner",
      },
      operationsList(["resolve", "manage"]),
    );
    renderScope();
    const banner = await screen.findByTestId("project-usage-banner");
    expect(banner.textContent).toContain("2999");
    expect(banner.textContent).toContain(text);
    expect(
      await screen.findByRole("button", { name: "P: 利用を続ける手続き" }),
    ).toBeTruthy();
    expect(screen.getByText("editable")).toBeTruthy();
  });

  it("tells a member a view-only project is view only and offers nothing", async () => {
    answer({ access: { kind: "read_only" }, role: "member" });
    renderScope();
    const banner = await screen.findByTestId("project-usage-banner");
    expect(banner.textContent).toContain("オーナーが行います");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("read-only")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/billing/operations"),
    );
  });

  it("shows the owner only the offered operations and the notice", async () => {
    answer(
      readOnlyOwner,
      operationsList(["resume"], true, {
        text: "お知らせ",
        url: "https://provider.example/notice",
      }),
    );
    renderScope();
    expect(
      await screen.findByRole("button", { name: "P: 利用を再開" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "お知らせ" }).getAttribute("href"),
    ).toBe("https://provider.example/notice");
    expect(screen.getByText("read-only")).toBeTruthy();
  });

  it("moves to the destination of the chosen operation", async () => {
    answer(readOnlyOwner, operationsList(["resume"]));
    renderScope();
    fireEvent.click(
      await screen.findByRole("button", { name: "P: 利用を再開" }),
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://provider.example/s"),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/billing/projects/p1/operations/resume?from=settings",
      { method: "POST" },
    );
  });

  it("reports a failed start and reads the operations again", async () => {
    answer(readOnlyOwner, operationsList(["resume"]));
    startAnswer = () => json({ error: "x" }, 503);
    renderScope();
    const button = await screen.findByRole("button", { name: "P: 利用を再開" });
    operationsAnswer = () => json(operationsList(["manage"]));
    fireEvent.click(button);
    expect(await screen.findByRole("button", { name: "P: 管理" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "処理を開始できませんでした",
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("says so, with a retry and no operation, when they cannot be read", async () => {
    answer(readOnlyOwner, operationsList([], false));
    renderScope();
    expect(
      await screen.findByText("利用できる操作を取得できません。"),
    ).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    operationsAnswer = () => json(operationsList(["resume"]));
    fireEvent.click(screen.getByRole("button", { name: "再取得" }));
    expect(
      await screen.findByRole("button", { name: "P: 利用を再開" }),
    ).toBeTruthy();
  });

  it.each([
    ["an unknown state", () => json({ access: { kind: "unknown" } })],
    ["a server error", () => json({}, 500)],
    ["an unrecognized answer", () => json({ access: { kind: "?" } })],
  ])("stays view only on %s and recovers on retry", async (_name, first) => {
    usageAnswer = first;
    renderScope();
    expect(await screen.findByText("read-only")).toBeTruthy();
    const retry = await screen.findByRole("button", { name: "再試行" });
    answer({ access: { kind: "available" }, role: "member" });
    fireEvent.click(retry);
    expect(await screen.findByText("editable")).toBeTruthy();
  });

  it("polls after returning from a resume until editing is back", async () => {
    vi.useFakeTimers();
    answer(readOnlyOwner);
    renderScope("/projects/p1?operation=resume");
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText(/手続きの反映を待っています/)).toBeTruthy();
    answer({ access: { kind: "available" }, role: "owner" });
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByText("editable")).toBeTruthy();
    expect(screen.queryByTestId("project-usage-banner")).toBeNull();
  });

  it("tells the owner the resume was not completed", async () => {
    answer(readOnlyOwner);
    renderScope("/projects/p1?operation=resume-cancel");
    expect(await screen.findByText(/手続きは完了していません/)).toBeTruthy();
  });
});
