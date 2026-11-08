import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthErrorProvider } from "../contexts/auth-error-context";
import type { Epic } from "../types/epic";
import { ProjectLabelsScreen } from "./project-labels-screen";

const PROJECT_ID = "project-1";

const label = (id: string, name: string) => ({
  __typename: "ProjectLabel",
  id,
  projectId: PROJECT_ID,
  name,
  color: "#336699",
  createdAt: "2026-01-01 00:00:00",
  updatedAt: "2026-01-01 00:00:00",
});

const epicOf = (overrides: Partial<Epic> = {}): Epic => ({
  id: "epic-growth",
  projectId: PROJECT_ID,
  labelId: "label-growth",
  labelName: "growth",
  labelColor: "#336699",
  enabled: true,
  description: "",
  successCriteria: "",
  ownerId: null,
  plannedStart: null,
  plannedEnd: null,
  outcomeStatus: "unevaluated",
  revision: 1,
  ...overrides,
});

type Call = { method: string; url: string; body: unknown };

function mockApi(options: {
  role?: "owner" | "member" | "viewer";
  epics?: Epic[];
  onRequest?: (call: Call) => Response | undefined;
}) {
  const calls: Call[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const call = { method, url, body };
    calls.push(call);
    const custom = options.onRequest?.(call);
    if (custom) return custom;
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status });
    if (url.endsWith("/labels") && method === "GET") {
      return json({
        labels: [label("label-growth", "growth"), label("label-ops", "ops")],
      });
    }
    if (url.endsWith("/members")) {
      return json({
        currentMemberRole: options.role ?? "owner",
        members: [
          { userId: "user-1", displayName: "Alice" },
          { userId: "user-2", displayName: "Bob" },
        ],
      });
    }
    if (url.endsWith("/epics")) {
      return json({ epics: options.epics ?? [] });
    }
    return json({ error: "unexpected" }, 500);
  });
  return calls;
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/labels`]}>
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/labels"
              element={<ProjectLabelsScreen />}
            />
          </Routes>
        </AuthErrorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const growthSwitch = () =>
  screen.getByRole("switch", { name: /戦略・計画管理: growth/ });

describe("ProjectLabelsScreen", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("turns planning on for a label and saves the plan with the current revision", async () => {
    const calls = mockApi({
      onRequest: (call) => {
        if (call.url.endsWith("/label-growth/epic/enable")) {
          return new Response(JSON.stringify({ epic: epicOf() }), {
            status: 200,
          });
        }
        if (call.method === "PATCH") {
          return new Response(
            JSON.stringify({
              epic: epicOf({
                description: "Grow signups",
                plannedStart: "2026-04-01",
                plannedEnd: "2026-06-30",
                ownerId: "user-2",
                revision: 2,
              }),
            }),
            { status: 200 },
          );
        }
        return undefined;
      },
    });
    const user = userEvent.setup();
    renderScreen();

    await waitFor(() => expect(growthSwitch()).toBeInTheDocument());
    expect(growthSwitch()).toHaveAttribute("aria-checked", "false");
    await user.click(growthSwitch());

    const purpose = await screen.findByLabelText("目的");
    expect(growthSwitch()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/目的・期間を入力すると/)).toBeInTheDocument();

    await user.type(purpose, "Grow signups");
    await user.selectOptions(screen.getByLabelText("担当者"), "user-2");
    fireEvent.change(screen.getByLabelText("開始日"), {
      target: { value: "2026-04-01" },
    });
    fireEvent.change(screen.getByLabelText("終了日"), {
      target: { value: "2026-06-30" },
    });
    await user.click(screen.getByRole("button", { name: "計画を保存" }));

    expect(await screen.findByText("保存しました")).toBeInTheDocument();
    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch?.body).toEqual({
      revision: 1,
      description: "Grow signups",
      successCriteria: "",
      ownerId: "user-2",
      plannedStart: "2026-04-01",
      plannedEnd: "2026-06-30",
      outcomeStatus: "unevaluated",
    });
  });

  it("restores a saved plan when planning is turned off and on again", async () => {
    const calls = mockApi({
      epics: [
        epicOf({
          description: "Grow signups",
          plannedStart: "2026-04-01",
          plannedEnd: "2026-06-30",
        }),
      ],
      onRequest: (call) => {
        if (call.url.endsWith("/epic/disable")) {
          return new Response(
            JSON.stringify({
              epic: epicOf({
                enabled: false,
                description: "Grow signups",
                plannedStart: "2026-04-01",
                plannedEnd: "2026-06-30",
                revision: 2,
              }),
            }),
            { status: 200 },
          );
        }
        if (call.url.endsWith("/epic/enable")) {
          return new Response(
            JSON.stringify({
              epic: epicOf({
                description: "Grow signups",
                plannedStart: "2026-04-01",
                plannedEnd: "2026-06-30",
                revision: 3,
              }),
            }),
            { status: 200 },
          );
        }
        return undefined;
      },
    });
    const user = userEvent.setup();
    renderScreen();

    await waitFor(() =>
      expect(screen.getByLabelText("目的")).toHaveValue("Grow signups"),
    );
    await user.click(growthSwitch());
    await waitFor(() => expect(screen.queryByLabelText("目的")).toBeNull());
    expect(
      screen.getByText(/再度 ON にすると復元されます/),
    ).toBeInTheDocument();

    await user.click(growthSwitch());
    expect(await screen.findByLabelText("目的")).toHaveValue("Grow signups");
    const enable = calls.find((call) => call.url.endsWith("/epic/enable"));
    expect(enable?.body).toEqual({ revision: 2 });
  });

  it("keeps the input on a conflict and retries with the latest revision", async () => {
    let patchCount = 0;
    const calls = mockApi({
      epics: [epicOf()],
      onRequest: (call) => {
        if (call.method === "PATCH") {
          patchCount += 1;
          return patchCount === 1
            ? new Response(
                JSON.stringify({
                  error: "conflict",
                  code: "REVISION_CONFLICT",
                }),
                { status: 409 },
              )
            : new Response(
                JSON.stringify({
                  epic: epicOf({ description: "Mine", revision: 6 }),
                }),
                { status: 200 },
              );
        }
        if (call.method === "GET" && call.url.endsWith("/label-growth/epic")) {
          return new Response(
            JSON.stringify({
              epic: epicOf({
                description: "Theirs",
                successCriteria: "Their criteria",
                revision: 5,
              }),
            }),
            { status: 200 },
          );
        }
        return undefined;
      },
    });
    const user = userEvent.setup();
    renderScreen();

    const purpose = await screen.findByLabelText("目的");
    await user.type(purpose, "Mine");
    await user.click(screen.getByRole("button", { name: "計画を保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "他の人が先にこの計画を更新しました",
    );
    expect(screen.getByLabelText("目的")).toHaveValue("Mine");

    await user.click(screen.getByRole("button", { name: "最新の版に更新" }));
    expect(
      await screen.findByText(/最新の版に更新しました/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("目的")).toHaveValue("Mine");
    expect(screen.getByLabelText("成功条件")).toHaveValue("Their criteria");

    await user.click(screen.getByRole("button", { name: "計画を保存" }));
    await screen.findByText("保存しました");
    const patches = calls.filter((call) => call.method === "PATCH");
    expect(
      patches.map((p) => (p.body as { revision: number }).revision),
    ).toEqual([1, 5]);
  });

  it("keeps the input and offers a retry when saving fails", async () => {
    mockApi({
      epics: [epicOf()],
      onRequest: (call) =>
        call.method === "PATCH"
          ? new Response(JSON.stringify({ error: "boom" }), { status: 500 })
          : undefined,
    });
    const user = userEvent.setup();
    renderScreen();

    await user.type(await screen.findByLabelText("目的"), "Keep me");
    await user.click(screen.getByRole("button", { name: "計画を保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "入力内容は保持されています",
    );
    expect(screen.getByLabelText("目的")).toHaveValue("Keep me");
    expect(screen.getByRole("button", { name: "計画を保存" })).toBeEnabled();
  });

  it("validates the planned period before sending", async () => {
    const calls = mockApi({ epics: [epicOf()] });
    const user = userEvent.setup();
    renderScreen();

    await screen.findByLabelText("目的");
    fireEvent.change(screen.getByLabelText("開始日"), {
      target: { value: "2026-04-01" },
    });
    await user.click(screen.getByRole("button", { name: "計画を保存" }));
    expect(
      await screen.findByText(/両方入力するか、両方空に/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("終了日"), {
      target: { value: "2026-03-01" },
    });
    await user.click(screen.getByRole("button", { name: "計画を保存" }));
    expect(
      await screen.findByText("開始日は終了日以前にしてください"),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("shows the impact before deleting and deletes only on confirmation", async () => {
    const calls = mockApi({
      epics: [epicOf({ description: "Grow signups" })],
      onRequest: (call) => {
        if (call.url.endsWith("/label-growth/deletion-impact")) {
          return new Response(
            JSON.stringify({
              labelId: "label-growth",
              labelName: "growth",
              storyCount: 7,
              epic: { id: "epic-growth", enabled: true, hasPlan: true },
            }),
            { status: 200 },
          );
        }
        if (call.method === "DELETE") {
          return new Response(null, { status: 200 });
        }
        return undefined;
      },
    });
    const user = userEvent.setup();
    renderScreen();

    await screen.findByLabelText("目的");
    await user.click(screen.getByRole("button", { name: /growth を削除/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("7 件の story");
    expect(dialog).toHaveTextContent("保存済みの計画が削除されます");
    expect(dialog).toHaveTextContent("OFF にしてください");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: /growth を削除/ }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() =>
      expect(screen.queryByTestId("label-row-label-growth")).toBeNull(),
    );
    expect(calls.some((call) => call.method === "DELETE")).toBe(true);
  });

  it("hides edit controls from viewers", async () => {
    mockApi({
      role: "viewer",
      epics: [epicOf({ description: "Grow signups" })],
    });
    renderScreen();

    expect(await screen.findByText("Grow signups")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: /削除/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "計画を保存" })).toBeNull();
  });
});
