import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StoryPanel } from "./story-panel";
import type { StoryInlineEditContext } from "./story-panel";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ToastProvider } from "../contexts/toast-context";
import type { Story } from "../types/story";
import type { Iteration } from "../types/iteration";

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    __typename: "Story",
    id: "s1",
    projectId: "p1",
    title: "Test Story",
    type: "feature",
    status: "Unstarted",
    storyPoint: 3,
    position: 1,
    isIcebox: false,
    iterationId: null,
    labels: [],
    description: "",
    requesterId: null,
    releaseDate: null,
    ownerIds: [],
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    statusChangedAt: "2024-01-01",
    isBlocked: false,
    isBlocking: false,
    ...overrides,
    storyNumber: overrides.storyNumber ?? 1,
  };
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof StoryPanel>> = {},
) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthErrorProvider>
        <ToastProvider>
          <DndContext>
            <StoryPanel
              panelType="Current"
              stories={[makeStory()]}
              {...props}
            />
          </DndContext>
        </ToastProvider>
      </AuthErrorProvider>
    </QueryClientProvider>,
  );
}

const ITERATIONS: Iteration[] = [
  {
    __typename: "Iteration",
    id: "iter-1",
    projectId: "p1",
    startDate: "2026-01-06",
    endDate: "2026-01-20",
    totalPoints: 0,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

const STORY_INLINE_EDIT_CONTEXT: StoryInlineEditContext = {
  pointScale: [],
  estimateBugs: true,
  estimateChores: true,
  onStoryUpdated: vi.fn(),
};

describe("StoryPanel", () => {
  it("renders panel header with label and count", () => {
    renderPanel();

    const panelLabel = screen.getByText("Current Iteration");
    expect(panelLabel).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(panelLabel.closest("header")?.className).toContain("sticky");
    expect(panelLabel.closest("header")?.className).toContain("top-0");
  });

  it("shows total points", () => {
    renderPanel({
      stories: [
        makeStory({ storyPoint: 5 }),
        makeStory({ id: "s2", storyPoint: 3 }),
      ],
    });

    const panelHeader = screen
      .getByTestId("panel-Current")
      .querySelector("header");
    expect(panelHeader).not.toBeNull();
    expect(
      within(panelHeader as HTMLElement).getByText("8 pt"),
    ).toBeInTheDocument();
  });

  it("shows velocity when provided", () => {
    renderPanel({ velocity: 21 });

    expect(screen.getByText("/ 21 pt")).toBeInTheDocument();
  });

  it("shows empty message when no stories", () => {
    renderPanel({ stories: [] });

    expect(screen.getByText("ストーリーはありません")).toBeInTheDocument();
  });

  it("shows loading message", () => {
    renderPanel({ stories: [], isLoading: true });

    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
  });

  it("keeps scroll inside the panel body", () => {
    renderPanel();

    expect(screen.getByTestId("panel-Current").className).toContain("min-h-0");
    expect(screen.getByTestId("panel-scroll-Current").className).toContain(
      "min-h-0",
    );
    expect(screen.getByTestId("panel-scroll-Current").className).toContain(
      "overflow-y-auto",
    );
  });

  it("keeps existing stories visible while loading more", () => {
    renderPanel({
      stories: [makeStory({ title: "Visible while loading" })],
      isLoading: true,
      hasNextPage: true,
      loadingMore: true,
      onLoadMore: vi.fn(),
    });

    expect(screen.getByText(/Visible while loading/)).toBeInTheDocument();
    expect(
      screen.queryByText("読み込み中...", { selector: "p" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "読み込み中..." }),
    ).toBeInTheDocument();
  });

  it("shows error with retry button", () => {
    const onRetry = vi.fn();
    renderPanel({
      stories: [],
      error: "Failed to load",
      onRetry,
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load");
    expect(screen.getByText("再試行")).toBeInTheDocument();
  });

  it("renders story cards with title", () => {
    renderPanel({
      stories: [makeStory({ title: "My Story" })],
    });

    expect(screen.getByText(/My Story/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "#1 をコピー" }),
    ).toBeInTheDocument();
  });

  it("renders accepted stories with accepted-only compact controls", () => {
    renderPanel({
      stories: [
        makeStory({
          id: "s-accepted-layout",
          status: "Accepted",
          title: "Accepted layout title",
        }),
      ],
    });

    expect(
      screen.getByTestId("story-header-accepted-meta-s-accepted-layout"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("story-header-title-row-s-accepted-layout"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("種別を変更")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("ストーリーポイントを変更"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTitle("タイトルを編集")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("リリースマーカーを編集"),
    ).not.toBeInTheDocument();
  });

  it("shows accepted compact controls when collapsed even if inline edit is enabled", () => {
    renderPanel({
      stories: [
        makeStory({
          id: "s-accepted-collapsed",
          status: "Accepted",
          title: "Accepted collapsed title",
        }),
      ],
      storyInlineEdit: STORY_INLINE_EDIT_CONTEXT,
      expandedStoryIds: new Set<string>(),
    });

    expect(screen.queryByLabelText("種別を変更")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("ストーリーポイントを変更"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTitle("タイトルを編集")).not.toBeInTheDocument();
  });

  it("shows accepted inline edit controls when expanded and inline edit is enabled", () => {
    renderPanel({
      stories: [
        makeStory({
          id: "s-accepted-expanded",
          status: "Accepted",
          title: "Accepted expanded title",
        }),
      ],
      storyInlineEdit: STORY_INLINE_EDIT_CONTEXT,
      expandedStoryIds: new Set<string>(["s-accepted-expanded"]),
    });

    expect(
      screen.queryByTestId("story-header-accepted-meta-s-accepted-expanded"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "種別を変更" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ストーリーポイントを変更" }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("タイトルを編集")).toBeInTheDocument();
  });

  it("keeps existing controls for non-accepted stories", () => {
    renderPanel({
      stories: [
        makeStory({
          id: "s-started-layout",
          status: "Started",
          title: "Started layout title",
        }),
      ],
      storyInlineEdit: STORY_INLINE_EDIT_CONTEXT,
    });

    expect(
      screen.getByTestId("story-header-title-row-s-started-layout"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /種別を変更/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ストーリーポイントを変更/i }),
    ).toBeInTheDocument();
  });

  it("shows blocked icon when story is blocked by others", () => {
    renderPanel({
      stories: [
        makeStory({
          id: "s-blocked",
          title: "Blocked story",
          isBlocked: true,
          isBlocking: false,
        }),
      ],
    });

    expect(screen.getByLabelText("ブロックされています")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("他ストーリーをブロック中"),
    ).not.toBeInTheDocument();
  });

  it("shows both blocker icons when story is blocked and blocking", () => {
    renderPanel({
      stories: [
        makeStory({
          id: "s-both",
          title: "Bidirectional block",
          isBlocked: true,
          isBlocking: true,
        }),
      ],
    });

    expect(screen.getByLabelText("ブロックされています")).toBeInTheDocument();
    expect(
      screen.getByLabelText("他ストーリーをブロック中"),
    ).toBeInTheDocument();
  });

  it("renders wrapped full title without truncate for accepted and non-accepted", () => {
    renderPanel({
      stories: [
        makeStory({
          id: "s-accepted-wrap",
          status: "Accepted",
          title:
            "Accepted title should wrap and remain fully visible in the header area",
        }),
        makeStory({
          id: "s-started-wrap",
          status: "Started",
          title:
            "Started title should wrap and remain fully visible in the header area",
          storyNumber: 2,
        }),
      ],
    });

    const acceptedTitle = screen.getByText(
      "Accepted title should wrap and remain fully visible in the header area",
    );
    const startedTitle = screen.getByText(
      "Started title should wrap and remain fully visible in the header area",
    );

    const acceptedTitleRow = acceptedTitle.closest(
      '[data-testid=\"story-header-title-row-s-accepted-wrap\"]',
    );
    const startedTitleRow = startedTitle.closest(
      '[data-testid=\"story-header-title-row-s-started-wrap\"]',
    );

    expect(acceptedTitleRow?.className).not.toContain("truncate");
    expect(acceptedTitleRow?.className).toContain("break-words");
    expect(startedTitleRow?.className).not.toContain("truncate");
    expect(startedTitleRow?.className).toContain("break-words");
  });

  it("keeps non-accepted inline edit mode with title edit trigger", () => {
    renderPanel({
      stories: [
        makeStory({
          id: "s-started-inline-edit",
          status: "Started",
          title: "Inline edit started layout title",
        }),
      ],
      storyInlineEdit: STORY_INLINE_EDIT_CONTEXT,
    });

    expect(
      screen.getByTestId("story-header-title-row-s-started-inline-edit"),
    ).toBeInTheDocument();
    expect(screen.getByTitle("タイトルを編集")).toBeInTheDocument();
  });

  it("toggles accepted accordion when clicking outside story number button", () => {
    const onToggleExpand = vi.fn();
    renderPanel({
      stories: [
        makeStory({
          id: "s-accepted-toggle",
          status: "Accepted",
          title: "Accepted toggle title",
        }),
      ],
      onToggleExpand,
    });

    const card = screen.getByTestId("panel-story-s-accepted-toggle");
    const headerButton = card.querySelector(
      '[role="button"][aria-expanded]',
    ) as HTMLElement;

    fireEvent.click(headerButton);
    expect(onToggleExpand).toHaveBeenCalledWith("s-accepted-toggle");
    expect(onToggleExpand).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "#1 をコピー" }));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("shows load more button when hasNextPage", () => {
    renderPanel({
      panelType: "Backlog",
      hasNextPage: true,
      onLoadMore: vi.fn(),
    });

    expect(screen.getByText("もっと読み込む")).toBeInTheDocument();
  });

  it("renders load more button at top when reverseOrder is enabled", () => {
    renderPanel({
      panelType: "Done",
      reverseOrder: true,
      hasNextPage: true,
      onLoadMore: vi.fn(),
    });

    const button = screen.getByRole("button", { name: "もっと読み込む" });
    expect(button.className).toContain("mb-2");
    expect(button.className).not.toContain("mt-2");
  });

  it("groups stories by iteration and shows start date with total points", () => {
    renderPanel({
      panelType: "Backlog",
      iterations: ITERATIONS,
      stories: [
        makeStory({
          id: "s1",
          title: "A",
          iterationId: "iter-1",
          storyPoint: 2,
        }),
        makeStory({ id: "s2", title: "B", iterationId: null, storyPoint: 3 }),
      ],
      replenishmentVelocity: 10,
      sprintDurationDays: 14,
      currentIterationEndDate: "2026-01-20",
    });

    expect(screen.getByText("開始: 2026-01-06")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /開始: 2026-01-06/i }),
    ).toHaveTextContent("2 pt");
    expect(screen.getByText("開始: 2026-01-21")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /開始: 2026-01-21/i }),
    ).toHaveTextContent("3 pt");
  });

  it("does not show replenishment candidate badges", () => {
    renderPanel({
      panelType: "Backlog",
      stories: [
        makeStory({
          id: "s-current",
          iterationId: null,
          storyPoint: 2,
          position: 1,
        }),
        makeStory({
          id: "s-next",
          iterationId: null,
          storyPoint: 3,
          position: 2,
        }),
      ],
      replenishmentVelocity: 10,
      currentTotalPoints: 5,
      sprintDurationDays: 14,
      currentIterationEndDate: "2026-01-20",
    });

    expect(screen.queryByText(/候補/)).not.toBeInTheDocument();
  });

  it("preserves incoming order in Current panel when sortable", () => {
    renderPanel({
      panelType: "Current",
      sortable: true,
      iterations: ITERATIONS,
      stories: [
        makeStory({
          id: "s-started",
          title: "Started second",
          status: "Started",
          iterationId: "iter-1",
          position: 1,
        }),
      ],
      acceptedStories: [
        makeStory({
          id: "s-accepted",
          title: "Accepted first",
          status: "Accepted",
          iterationId: "iter-1",
          position: 99,
        }),
      ],
    });

    const cards = screen.getAllByTestId(/panel-story-/);
    expect(cards[0]?.getAttribute("data-testid")).toBe(
      "panel-story-s-accepted",
    );
    expect(cards[1]?.getAttribute("data-testid")).toBe("panel-story-s-started");
  });

  it("orders current accepted stories by accepted-at ascending", () => {
    renderPanel({
      panelType: "Current",
      stories: [
        makeStory({
          id: "s-started",
          title: "Started second",
          status: "Started",
          iterationId: "iter-1",
          position: 2,
        }),
      ],
      acceptedStories: [
        makeStory({
          id: "s-accepted-high",
          title: "Accepted high",
          status: "Accepted",
          iterationId: "iter-1",
          position: 1,
          statusChangedAt: "2026-12-31",
        }),
        makeStory({
          id: "s-accepted-low",
          title: "Accepted low",
          status: "Accepted",
          iterationId: "iter-1",
          position: 10,
          statusChangedAt: "2026-01-01",
        }),
      ],
    });

    const cards = screen.getAllByTestId(/panel-story-/);
    expect(cards[0]?.getAttribute("data-testid")).toBe(
      "panel-story-s-accepted-low",
    );
    expect(cards[1]?.getAttribute("data-testid")).toBe(
      "panel-story-s-accepted-high",
    );
    expect(cards[2]?.getAttribute("data-testid")).toBe("panel-story-s-started");
  });

  it("preserves incoming order for combined current/backlog rendering", () => {
    renderPanel({
      panelType: "Backlog",
      sortable: true,
      preserveStoryOrder: true,
      iterations: ITERATIONS,
      stories: [
        makeStory({
          id: "s-current-accepted",
          title: "Current accepted",
          status: "Accepted",
          iterationId: "iter-1",
          position: 99,
        }),
        makeStory({
          id: "s-current-unstarted",
          title: "Current unstarted",
          status: "Unstarted",
          iterationId: "iter-1",
          position: 1,
        }),
      ],
    });

    const cards = screen.getAllByTestId(/panel-story-/);
    expect(cards[0]?.getAttribute("data-testid")).toBe(
      "panel-story-s-current-accepted",
    );
    expect(cards[1]?.getAttribute("data-testid")).toBe(
      "panel-story-s-current-unstarted",
    );
  });

  it("renders current accepted stories in the main list with top load more button", () => {
    renderPanel({
      panelType: "Current",
      stories: [makeStory({ id: "s-started", title: "Started" })],
      acceptedStories: [
        makeStory({
          id: "s-accepted",
          title: "Accepted",
          status: "Accepted",
          iterationId: "iter-1",
        }),
      ],
      acceptedHasNextPage: true,
      onLoadMoreAccepted: vi.fn(),
    });

    expect(
      screen.queryByTestId("panel-current-accepted-section"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "追加読み込み" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Accepted/)).toBeInTheDocument();
    expect(screen.getByText(/Started/)).toBeInTheDocument();
  });

  it("renders accepted stories even when unaccepted current stories are empty", () => {
    renderPanel({
      panelType: "Current",
      stories: [],
      acceptedStories: [
        makeStory({
          id: "s-accepted-only",
          title: "Accepted only",
          status: "Accepted",
          iterationId: "iter-1",
        }),
      ],
    });

    expect(
      screen.queryByTestId("panel-current-accepted-section"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("ストーリーはありません"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Accepted only/)).toBeInTheDocument();
  });

  it("does not render drag handle for stories in current accepted section", () => {
    renderPanel({
      panelType: "Current",
      sortable: true,
      stories: [makeStory({ id: "s-started", title: "Started" })],
      acceptedStories: [
        makeStory({
          id: "s-accepted",
          title: "Accepted",
          status: "Accepted",
          iterationId: "iter-1",
        }),
      ],
    });

    expect(
      screen.queryByRole("button", { name: "Reorder Accepted" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reorder Started" }),
    ).toBeInTheDocument();
  });

  it("collapses and expands iteration groups", () => {
    renderPanel({
      panelType: "Backlog",
      iterations: ITERATIONS,
      stories: [makeStory({ title: "Collapsed Story", iterationId: "iter-1" })],
    });

    fireEvent.click(screen.getByRole("button", { name: /開始: 2026-01-06/i }));
    expect(screen.queryByText(/Collapsed Story/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /開始: 2026-01-06/i }));
    expect(screen.getByText(/Collapsed Story/)).toBeInTheDocument();
  });

  it("keeps iteration group header sticky inside panel scroll", () => {
    renderPanel({
      panelType: "Backlog",
      iterations: ITERATIONS,
      stories: [makeStory({ title: "Sticky Group", iterationId: "iter-1" })],
    });

    const groupHeader = screen.getByRole("button", {
      name: /開始: 2026-01-06/i,
    });
    expect(groupHeader.parentElement?.className).toContain("sticky");
    expect(groupHeader.parentElement?.className).toContain("top-0");
  });

  it("offsets story accordion sticky header below iteration row when grouped", () => {
    renderPanel({
      panelType: "Backlog",
      iterations: ITERATIONS,
      stories: [makeStory({ title: "Offset Story", iterationId: "iter-1" })],
    });

    const card = screen.getByTestId("panel-story-s1");
    const stickyZone = card.firstElementChild as HTMLElement;
    expect(stickyZone.className).toContain("sticky");
    expect(stickyZone).toHaveStyle({ top: "var(--story-sticky-offset)" });
    const section = card.closest("section.mb-2.rounded");
    expect(section).not.toBeNull();
    expect(
      (section as HTMLElement).style
        .getPropertyValue("--story-sticky-offset")
        .trim(),
    ).toMatch(/^\d+px$/);
  });

  it("keeps story accordion sticky at scroll top in Icebox panel", () => {
    render(
      <DndContext>
        <StoryPanel panelType="Icebox" stories={[makeStory()]} />
      </DndContext>,
    );

    const card = screen.getByTestId("panel-story-s1");
    const stickyZone = card.firstElementChild;
    expect(stickyZone?.className).toContain("sticky");
    expect(stickyZone?.className).toContain("top-0");
  });

  it("supports one-click workflow status change", () => {
    const onStatusChange = vi.fn();
    renderPanel({
      stories: [makeStory({ status: "Started" })],
      onStatusChange,
    });

    const card = screen.getByTestId("panel-story-s1");
    fireEvent.click(within(card).getByRole("button", { name: "Finish" }));

    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(onStatusChange.mock.calls[0]?.[0].id).toBe("s1");
    expect(onStatusChange.mock.calls[0]?.[1]).toBe("Finished");
  });

  it("toggles expand when clicking story card header region", () => {
    const onToggleExpand = vi.fn();
    renderPanel({
      stories: [makeStory({ status: "Started" })],
      expandedStoryIds: new Set(),
      onToggleExpand,
      onStatusChange: vi.fn(),
    });

    const card = screen.getByTestId("panel-story-s1");
    const headerToggle = card.querySelector(
      '[role="button"][aria-expanded="false"]',
    ) as HTMLElement;
    expect(headerToggle).toBeTruthy();
    fireEvent.click(headerToggle);
    expect(onToggleExpand).toHaveBeenCalledWith("s1");
  });

  it("does not toggle expand when clicking a workflow status button", () => {
    const onToggleExpand = vi.fn();
    renderPanel({
      stories: [makeStory({ status: "Started" })],
      expandedStoryIds: new Set(),
      onToggleExpand,
      onStatusChange: vi.fn(),
    });

    const card = screen.getByTestId("panel-story-s1");
    fireEvent.click(within(card).getByRole("button", { name: "Finish" }));
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it("copies story number without toggling expand when clicking number pill", () => {
    const onToggleExpand = vi.fn();
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    renderPanel({
      stories: [makeStory({ storyNumber: 244 })],
      expandedStoryIds: new Set(),
      onToggleExpand,
    });

    fireEvent.click(screen.getByRole("button", { name: "#244 をコピー" }));

    expect(writeText).toHaveBeenCalledWith("244");
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it("does not toggle expand when clicking title edit trigger row", () => {
    const onToggleExpand = vi.fn();
    renderPanel({
      stories: [makeStory({ status: "Started", title: "Editable title row" })],
      expandedStoryIds: new Set(),
      onToggleExpand,
      storyInlineEdit: STORY_INLINE_EDIT_CONTEXT,
    });

    fireEvent.click(screen.getByTestId("story-header-title-row-s1"));
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it("shows success toast when copying accepted story number", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    renderPanel({
      stories: [makeStory({ status: "Accepted", storyNumber: 259 })],
    });

    fireEvent.click(screen.getByRole("button", { name: "#259 をコピー" }));

    expect(writeText).toHaveBeenCalledWith("259");
    expect(await screen.findByText("番号をコピーしました")).toBeInTheDocument();
  });

  it("shows error toast when accepted story number copy fails", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("clipboard failure");
    });
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    renderPanel({
      stories: [makeStory({ status: "Accepted", storyNumber: 267 })],
    });

    fireEvent.click(screen.getByRole("button", { name: "#267 をコピー" }));

    expect(writeText).toHaveBeenCalledWith("267");
    expect(
      await screen.findByText("番号のコピーに失敗しました"),
    ).toBeInTheDocument();
  });

  it("does not show story number on release story card in list", () => {
    renderPanel({
      stories: [
        makeStory({
          type: "release",
          storyNumber: 201,
          title: "2026.05 リリース",
        }),
      ],
    });

    expect(screen.getByText("2026.05 リリース")).toBeInTheDocument();
    expect(screen.queryByText("#201")).not.toBeInTheDocument();
  });
});
