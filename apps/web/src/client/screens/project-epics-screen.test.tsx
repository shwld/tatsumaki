import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthErrorProvider } from "../contexts/auth-error-context";
import { i18n } from "../i18n/config";
import type { Epic, EpicProgress, EpicWithProgress } from "../types/epic";
import {
  ProjectEpicDetailScreen,
  ProjectEpicsScreen,
} from "./project-epics-screen";

const PROJECT_ID = "project-1";

const epicOf = (overrides: Partial<Epic>): Epic => ({
  id: `epic-${overrides.labelId}`,
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

const progressOf = (overrides: Partial<EpicProgress> = {}): EpicProgress => ({
  state: "in_progress",
  storyCompletionRate: 0.5,
  stories: {
    total: 4,
    accepted: 2,
    inProgress: 1,
    unstarted: 1,
    icebox: 0,
    blocked: 0,
  },
  pointCompletionRate: 0.5,
  points: { estimatedPoints: 8, acceptedPoints: 4, excludedStories: 1 },
  overdue: false,
  ...overrides,
});

const item = (
  epic: Partial<Epic>,
  progress: Partial<EpicProgress> = {},
): EpicWithProgress => ({
  epic: epicOf(epic),
  progress: progressOf(progress),
});

function mockFetch(handler: (url: string) => unknown, status = 200) {
  vi.mocked(fetch).mockImplementation(
    async (input) =>
      new Response(
        JSON.stringify(handler(typeof input === "string" ? input : "")),
        { status },
      ),
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthErrorProvider>
        <Routes>
          <Route
            path="/projects/:projectId/epics"
            element={<ProjectEpicsScreen />}
          />
          <Route
            path="/projects/:projectId/epics/:labelId"
            element={<ProjectEpicDetailScreen />}
          />
        </Routes>
      </AuthErrorProvider>
    </MemoryRouter>,
  );
}

function NavigateOnClick({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      go-b
    </button>
  );
}

describe("ProjectEpicsScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-08T00:00:00Z"));
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows only enabled epics and sorts them into timeline, unscheduled and outside the range", async () => {
    mockFetch(() => ({
      epics: [
        item({
          labelId: "label-growth",
          labelName: "growth",
          plannedStart: "2026-10-01",
          plannedEnd: "2026-12-31",
        }),
        item(
          {
            labelId: "label-ops",
            labelName: "ops",
            plannedStart: "2026-09-01",
            plannedEnd: "2026-10-31",
          },
          { overdue: true },
        ),
        item({ labelId: "label-someday", labelName: "someday" }),
        item({
          labelId: "label-old",
          labelName: "old",
          plannedStart: "2026-01-01",
          plannedEnd: "2026-03-31",
        }),
        item({
          labelId: "label-far",
          labelName: "far",
          plannedStart: "2027-08-01",
          plannedEnd: "2027-09-30",
        }),
        item(
          {
            labelId: "label-empty",
            labelName: "empty",
            plannedStart: "2026-11-01",
            plannedEnd: "2026-11-30",
          },
          { state: "no_stories", storyCompletionRate: null },
        ),
        item({ labelId: "label-off", labelName: "off", enabled: false }),
      ],
    }));
    renderAt(`/projects/${PROJECT_ID}/epics`);

    expect(
      await screen.findByRole("link", { name: /growth: 2026-10-01/ }),
    ).toHaveAttribute("href", `/projects/${PROJECT_ID}/epics/label-growth`);
    expect(screen.getByText("計画終了日超過")).toBeInTheDocument();
    expect(screen.getAllByText("story 未登録").length).toBeGreaterThan(0);
    expect(screen.getByText("期間未設定")).toBeInTheDocument();
    expect(screen.getByText(/someday/)).toBeInTheDocument();
    expect(screen.getByText("表示期間より前の Epic: 1 件")).toBeInTheDocument();
    expect(screen.getByText("表示期間より後の Epic: 1 件")).toBeInTheDocument();
    expect(screen.queryByText(/\boff\b/)).not.toBeInTheDocument();
  });

  it("moves the visible months to the epic outside the range", async () => {
    mockFetch(() => ({
      epics: [
        item({
          labelId: "label-far",
          labelName: "far",
          plannedStart: "2027-08-01",
          plannedEnd: "2027-09-30",
        }),
      ],
    }));
    renderAt(`/projects/${PROJECT_ID}/epics`);

    fireEvent.click(await screen.findByRole("button", { name: "移動" }));

    expect(
      await screen.findByRole("link", { name: /far: 2027-08-01/ }),
    ).toBeInTheDocument();
  });

  it("guides to label settings when no epic is enabled", async () => {
    mockFetch(() => ({ epics: [item({ enabled: false })] }));
    renderAt(`/projects/${PROJECT_ID}/epics`);

    expect(
      await screen.findByRole("link", { name: "Label 設定を開く" }),
    ).toHaveAttribute("href", `/projects/${PROJECT_ID}/labels`);
  });

  it("offers a retry when loading fails", async () => {
    mockFetch(() => ({ error: "x" }), 500);
    renderAt(`/projects/${PROJECT_ID}/epics`);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Epic の読み込みに失敗しました",
    );
  });
  it("keeps a very short epic bar tied to its dates and labels it beside the bar", async () => {
    mockFetch(() => ({
      epics: [
        item({
          labelId: "label-short",
          labelName: "short",
          plannedStart: "2026-11-02",
          plannedEnd: "2026-11-03",
        }),
      ],
    }));
    renderAt(`/projects/${PROJECT_ID}/epics`);

    const link = await screen.findByRole("link", { name: /short: 2026-11-02/ });
    expect(link.style.minWidth).not.toBe("");
    expect(link).not.toHaveTextContent("short");
    expect(screen.getByText("short")).toBeInTheDocument();
  });
});

describe("ProjectEpicDetailScreen", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows plan, progress, breakdown and links to the label-filtered Stories", async () => {
    mockFetch((url) =>
      url.endsWith("/members")
        ? { members: [{ userId: "user-1", displayName: "Alice" }] }
        : item({
            labelId: "label-growth",
            description: "新規登録を増やす",
            successCriteria: "月間 1,000 件",
            ownerId: "user-1",
            plannedStart: "2026-10-01",
            plannedEnd: "2026-12-31",
            outcomeStatus: "achieved",
          }),
    );
    renderAt(`/projects/${PROJECT_ID}/epics/label-growth`);

    expect(await screen.findByText("新規登録を増やす")).toBeInTheDocument();
    expect(screen.getByText("月間 1,000 件")).toBeInTheDocument();
    expect(screen.getByText("達成")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.getByText("2026-10-01 〜 2026-12-31")).toBeInTheDocument();
    expect(screen.getByText("story 完了率 50%（2/4 件）")).toBeInTheDocument();
    expect(screen.getByText("4/8 pt（50%）")).toBeInTheDocument();
    expect(screen.getByText("集計対象外の story: 1 件")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "この Label の Stories を開く" }),
    ).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/stories?labelIds=label-growth`,
    );
  });

  it("explains an epic without stories", async () => {
    mockFetch(() =>
      item(
        { labelId: "label-growth" },
        {
          state: "no_stories",
          storyCompletionRate: null,
          pointCompletionRate: null,
          stories: {
            total: 0,
            accepted: 0,
            inProgress: 0,
            unstarted: 0,
            icebox: 0,
            blocked: 0,
          },
          points: { estimatedPoints: 0, acceptedPoints: 0, excludedStories: 0 },
        },
      ),
    );
    renderAt(`/projects/${PROJECT_ID}/epics/label-growth`);

    expect(await screen.findAllByText("story 未登録")).not.toHaveLength(0);
    expect(screen.getByText("期間未設定")).toBeInTheDocument();
    expect(
      screen.getByText(/ポイントの集計対象がありません/),
    ).toBeInTheDocument();
  });

  it("shows an error when the epic is not available", async () => {
    mockFetch(() => ({ error: "off", code: "EPIC_PLANNING_OFF" }), 404);
    renderAt(`/projects/${PROJECT_ID}/epics/label-growth`);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "計画管理が OFF の可能性があります",
    );
  });

  it("does not keep showing the previous epic while another one loads", async () => {
    let release: (() => void) | undefined;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : "";
      if (url.includes("label-b")) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      const labelName = url.includes("label-b") ? "beta" : "alpha";
      return new Response(
        JSON.stringify(
          item({
            labelId: url.includes("label-b") ? "label-b" : "label-a",
            labelName,
          }),
        ),
        { status: 200 },
      );
    });
    const view = render(
      <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/epics/label-a`]}>
        <AuthErrorProvider>
          <Routes>
            <Route
              path="/projects/:projectId/epics/:labelId"
              element={<ProjectEpicDetailScreen />}
            />
          </Routes>
          <NavigateOnClick to={`/projects/${PROJECT_ID}/epics/label-b`} />
        </AuthErrorProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "alpha" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "go-b" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "alpha" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    release?.();
    expect(
      await screen.findByRole("heading", { name: "beta" }),
    ).toBeInTheDocument();
    view.unmount();
  });
});

describe("Epics screens language", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-08T00:00:00Z"));
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    ["ja", "Epics に戻る", "期間未設定", "story 未登録"],
    ["en", "Back to Epics", "No period set", "No stories"],
  ] as const)("renders the list and detail in %s without raw keys", async (language, back, unscheduled, noStories) => {
    await i18n.changeLanguage(language);
    mockFetch(() => ({
      epics: [
        item(
          { labelId: "label-someday", labelName: "someday" },
          { state: "no_stories" },
        ),
      ],
    }));
    const list = renderAt(`/projects/${PROJECT_ID}/epics`);
    expect(await screen.findByText(unscheduled)).toBeInTheDocument();
    expect(list.container.textContent).not.toMatch(/projectEpic/);
    list.unmount();

    mockFetch(() =>
      item(
        { labelId: "label-someday", labelName: "someday" },
        { state: "no_stories" },
      ),
    );
    const detail = renderAt(`/projects/${PROJECT_ID}/epics/label-someday`);
    expect(await screen.findByText(back)).toBeInTheDocument();
    expect(detail.container.textContent).not.toMatch(/projectEpic/);
    expect(detail.container.textContent).toContain(noStories);
  });
});
