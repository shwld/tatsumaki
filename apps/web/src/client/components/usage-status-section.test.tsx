import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ProjectUsageSection } from "./project-usage-section";
import { UsageStatusSection } from "./usage-status-section";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const list = {
  operationsAvailable: true,
  accountOperations: ["manage"],
  projects: [
    {
      projectId: "p1",
      projectName: "Alpha",
      access: {
        kind: "limited",
        until: "2999-01-02T03:04:00Z",
        untilReason: "ending",
      },
      operations: ["manage"],
      notice: null,
    },
    {
      projectId: "p2",
      projectName: "Beta",
      access: { kind: "read_only" },
      operations: [],
      notice: null,
    },
  ],
};

let mode: () => Response;
let operations: () => Response;
const assign = vi.fn();

const renderWith = (element: React.ReactNode) =>
  render(
    <MemoryRouter>
      <AuthErrorProvider>{element}</AuthErrorProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  mode = () => json({ mode: "control-plane" });
  operations = () => json(list);
  vi.stubGlobal("location", { ...window.location, assign });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return json({ url: "https://provider.example/s" }, 201);
      }
      return String(input) === "/api/usage/mode" ? mode() : operations();
    }),
  );
});
afterEach(() => {
  assign.mockReset();
  vi.unstubAllGlobals();
});

describe("UsageStatusSection", () => {
  it("lists each owned project with its state and offered operations only", async () => {
    renderWith(<UsageStatusSection />);
    expect(await screen.findByText("Alpha")).toBeTruthy();
    expect(screen.getByText(/まで利用できます/)).toBeTruthy();
    expect(screen.getByText("閲覧のみ")).toBeTruthy();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["アカウント全体の管理", "管理"]);
  });

  it.each([
    ["アカウント全体の管理", "/api/usage/account-operations/manage"],
    ["Alpha: 管理", "/api/usage/projects/p1/operations/manage?from=account"],
  ])("moves to the destination of %s", async (name, path) => {
    renderWith(<UsageStatusSection />);
    fireEvent.click(await screen.findByRole("button", { name }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://provider.example/s"),
    );
    expect(fetch).toHaveBeenCalledWith(path, { method: "POST" });
  });

  it("says operations cannot be read and offers only a retry", async () => {
    operations = () =>
      json({
        operationsAvailable: false,
        accountOperations: [],
        projects: [],
      });
    renderWith(<UsageStatusSection />);
    expect(
      await screen.findByText("利用できる操作を取得できません。"),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["再取得"]);
  });

  it("recovers from a failed load with retry", async () => {
    operations = () => json({}, 500);
    renderWith(<UsageStatusSection />);
    const retry = await screen.findByRole("button", { name: "再取得" });
    operations = () => json(list);
    fireEvent.click(retry);
    expect(await screen.findByText("Alpha")).toBeTruthy();
  });

  it("shows that a self-hosted deployment has no limits", async () => {
    mode = () => json({ mode: "self-hosted" });
    renderWith(<UsageStatusSection />);
    expect(
      await screen.findByText("このサービスには利用上限がありません。"),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectUsageSection", () => {
  it("shows only the selected project and returns to its settings", async () => {
    renderWith(<ProjectUsageSection projectId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Alpha: 管理" }));
    expect(screen.queryByText("閲覧のみ")).toBeNull();
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/usage/projects/p1/operations/manage?from=settings",
      { method: "POST" },
    );
  });

  it("renders nothing on a self-hosted deployment", async () => {
    mode = () => json({ mode: "self-hosted" });
    renderWith(<ProjectUsageSection projectId="p1" />);
    await waitFor(() =>
      expect(screen.queryByTestId("project-usage-section")).toBeNull(),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
