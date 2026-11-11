import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoryMapStructure } from "../../domain/entities/story-map";
import { i18n } from "../i18n/config";
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
  personas: [],
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
    },
  ],
};

describe("StoryMapBoard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it("adds an idea card to the unplanned cell", () => {
    const send = vi.fn();
    render(<StoryMapBoard structure={structure} editable send={send} />);
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
    render(<StoryMapBoard structure={structure} editable send={send} />);
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
    render(<StoryMapBoard structure={structure} editable send={send} />);
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
    render(<StoryMapBoard structure={structure} editable send={send} />);
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
    render(<StoryMapBoard structure={structure} editable send={send} />);
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
    render(<StoryMapBoard structure={structure} editable send={send} />);
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
});
