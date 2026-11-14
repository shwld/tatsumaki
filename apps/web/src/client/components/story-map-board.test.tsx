import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoryMapStructure } from "../../domain/entities/story-map";
import { i18n } from "../i18n/config";
import * as api from "../lib/story-maps-api";
import { StoryMapBoard } from "./story-map-board";

const structure: StoryMapStructure = {
  map: {
    __typename: "StoryMap",
    id: "m1",
    projectId: "p1",
    title: "Map",
    achievementGoal: "",
    archivedAt: null,
    createdAt: "",
    updatedAt: "",
  },
  activities: [
    { id: "a1", title: "Sign up", position: 0 },
    { id: "a2", title: "Plan", position: 1 },
  ],
  tasks: [
    { id: "t1", activityId: "a1", title: "Register", position: 0 },
    { id: "t2", activityId: "a2", title: "Create story", position: 0 },
  ],
  slices: [{ id: "s1", title: "MVP", position: 0 }],
  cards: [
    {
      id: "c1",
      taskId: "t1",
      sliceId: null,
      position: 0,
      ideaTitle: "Email form",
      note: "",
      storyId: null,
      storyState: "idea",
      story: null,
    },
  ],
};

function renderBoard(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("StoryMapBoard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it("adds an idea card to the unplanned cell", () => {
    const send = vi.fn();
    renderBoard(<StoryMapBoard structure={structure} editable send={send} />);
    const cell = screen.getByTestId("cell-t2-unplanned");
    fireEvent.click(within(cell).getByRole("button", { name: "カードを追加" }));
    fireEvent.change(within(cell).getByRole("textbox"), {
      target: { value: "New idea" },
    });
    fireEvent.click(within(cell).getByRole("button", { name: "追加" }));
    expect(send).toHaveBeenCalledWith({
      type: "addCard",
      taskId: "t2",
      sliceId: null,
      afterCardId: null,
      ideaTitle: "New idea",
    });
  });

  it("moves a card to a slice from the card menu without dragging", () => {
    const send = vi.fn();
    renderBoard(<StoryMapBoard structure={structure} editable send={send} />);
    fireEvent.click(
      screen.getByRole("button", { name: /カードメニュー: Email form/ }),
    );
    fireEvent.change(screen.getByLabelText("移動先のタスク"), {
      target: { value: "t2" },
    });
    fireEvent.change(screen.getByLabelText("移動先のスライス"), {
      target: { value: "s1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "移動" }));
    expect(send).toHaveBeenCalledWith({
      type: "moveCard",
      cardId: "c1",
      taskId: "t2",
      sliceId: "s1",
      afterCardId: null,
    });
  });

  it("moves a card with Alt+arrow keys", () => {
    const send = vi.fn();
    renderBoard(<StoryMapBoard structure={structure} editable send={send} />);
    fireEvent.keyDown(screen.getByText("Email form"), {
      key: "ArrowRight",
      altKey: true,
    });
    expect(send).toHaveBeenLastCalledWith({
      type: "moveCard",
      cardId: "c1",
      taskId: "t2",
      sliceId: null,
      afterCardId: null,
    });
    fireEvent.keyDown(screen.getByText("Email form"), {
      key: "ArrowDown",
      altKey: true,
    });
    expect(send).toHaveBeenLastCalledWith({
      type: "moveCard",
      cardId: "c1",
      taskId: "t1",
      sliceId: "s1",
      afterCardId: null,
    });
  });

  it("moves a card by dropping it on another cell", () => {
    const send = vi.fn();
    renderBoard(<StoryMapBoard structure={structure} editable send={send} />);
    fireEvent.dragStart(screen.getByText("Email form").closest("li")!);
    fireEvent.drop(screen.getByTestId("cell-t2-s1"));
    expect(send).toHaveBeenCalledWith({
      type: "moveCard",
      cardId: "c1",
      taskId: "t2",
      sliceId: "s1",
      afterCardId: null,
    });
  });

  it("confirms deletion with the number of affected cards", () => {
    const send = vi.fn();
    renderBoard(<StoryMapBoard structure={structure} editable send={send} />);
    fireEvent.click(screen.getByRole("button", { name: "削除: Sign up" }));
    expect(screen.getByText(/タスク 1 件・カード 1 件/)).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "削除" }));
    expect(send).toHaveBeenCalledWith({
      type: "deleteActivity",
      activityId: "a1",
    });
  });

  it("asks again before deleting a card", () => {
    const send = vi.fn();
    renderBoard(<StoryMapBoard structure={structure} editable send={send} />);
    fireEvent.click(
      screen.getByRole("button", { name: /カードメニュー: Email form/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "本当に削除する" }));
    expect(send).toHaveBeenCalledWith({ type: "deleteCard", cardId: "c1" });
  });

  it("is read-only for viewers", () => {
    render(
      <StoryMapBoard structure={structure} editable={false} send={vi.fn()} />,
    );
    expect(screen.getByText("Email form")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  const withCards = (cards: StoryMapStructure["cards"]): StoryMapStructure => ({
    ...structure,
    cards,
  });
  const idea = structure.cards[0];
  if (!idea) throw new Error("fixture");

  it("shows number, title, state and estimate of a linked card with a link to the story", () => {
    renderBoard(
      <StoryMapBoard
        structure={withCards([
          {
            ...idea,
            ideaTitle: null,
            storyId: "s1",
            storyState: "linked",
            story: {
              number: 12,
              title: "Sign in",
              status: "Started",
              type: "feature",
              storyPoint: 3,
              isIcebox: false,
            },
          },
        ])}
        editable={false}
        send={vi.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: "story #12 を開く" });
    expect(link.getAttribute("href")).toBe("/projects/p1/stories/12");
    expect(link.textContent).toBe("#12 Sign in");
    expect(screen.getByText("Started")).toBeTruthy();
    expect(screen.getByText("feature")).toBeTruthy();
    expect(screen.getByText("3 pt")).toBeTruthy();
  });

  it("labels a linked card by its story, not its old idea title, in move choices", () => {
    renderBoard(
      <StoryMapBoard
        structure={withCards([
          {
            ...idea,
            id: "c1",
            ideaTitle: "Old idea",
            storyId: "s1",
            storyState: "linked",
            story: {
              number: 7,
              title: "Renamed",
              status: "Started",
              type: "feature",
              storyPoint: null,
              isIcebox: false,
            },
          },
          { ...idea, id: "c2", ideaTitle: "Other", position: 1 },
        ])}
        editable
        send={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "カードメニュー: Other" }),
    );
    expect(
      screen.getByRole("option", { name: "「#7 Renamed」の後" }),
    ).toBeTruthy();
    expect(screen.queryByText(/Old idea/)).toBeNull();
  });

  it("explains a deleted story and offers relinking", () => {
    renderBoard(
      <StoryMapBoard
        structure={withCards([
          {
            ...idea,
            ideaTitle: null,
            storyId: "gone",
            storyState: "missing",
            story: null,
          },
        ])}
        editable
        send={vi.fn()}
      />,
    );
    expect(screen.getByText("削除された story")).toBeTruthy();
    expect(screen.getByText(/別の story に紐づけ直す/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /カードメニュー/ }));
    expect(
      screen.getByRole("button", { name: "別の story に紐づけ直す" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "story にする" })).toBeNull();
  });

  it("links a card to a story found by search", async () => {
    const search = vi.spyOn(api, "searchStoriesForCard").mockResolvedValue({
      ok: true,
      value: [
        {
          id: "s1",
          number: 5,
          title: "Taken",
          status: "Started",
          type: "feature",
          storyPoint: null,
          isIcebox: false,
          placed: true,
        },
        {
          id: "s2",
          number: 6,
          title: "Free",
          status: "Unstarted",
          type: "feature",
          storyPoint: 2,
          isIcebox: false,
          placed: false,
        },
      ],
    });
    const send = vi.fn();
    renderBoard(<StoryMapBoard structure={structure} editable send={send} />);
    fireEvent.click(screen.getByRole("button", { name: /カードメニュー/ }));
    fireEvent.click(screen.getByRole("button", { name: "story に紐づける" }));
    fireEvent.change(
      screen.getByLabelText("story を検索（番号またはタイトル）"),
      {
        target: { value: "fr" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "検索" }));
    const choose = await screen.findByRole("button", {
      name: "紐づける: #6 Free",
    });
    expect(search).toHaveBeenCalledWith("p1", "m1", "fr");
    expect(screen.getByText("配置済み")).toBeTruthy();
    fireEvent.click(choose);
    expect(send).toHaveBeenCalledWith({
      type: "setCardStory",
      cardId: "c1",
      storyId: "s2",
    });
  });

  it("confirms the story fields, seeded from the card's context, before creating it", () => {
    const send = vi.fn();
    renderBoard(
      <StoryMapBoard
        structure={withCards([{ ...idea, note: "Why", sliceId: "s1" }])}
        editable
        send={send}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /カードメニュー/ }));
    fireEvent.click(screen.getByRole("button", { name: "story にする" }));
    const form = screen.getByRole("form", { name: "story を作成して紐づけ" });
    const description = within(form).getByLabelText(
      "説明",
    ) as HTMLTextAreaElement;
    expect(description.value).toBe(
      "Why\nストーリーマップ: Map\nタスク: Register\nスライス: MVP",
    );
    fireEvent.change(within(form).getByLabelText("種別"), {
      target: { value: "chore" },
    });
    fireEvent.change(within(form).getByLabelText("作成先"), {
      target: { value: "icebox" },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "作成して紐づける" }),
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: "createStoryFromCard",
      cardId: "c1",
      title: "Email form",
      description: description.value,
      storyType: "chore",
      isIcebox: true,
    });
  });
});
