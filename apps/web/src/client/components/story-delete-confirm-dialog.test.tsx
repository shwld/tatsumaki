import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StoryDeleteConfirmDialog } from "./story-delete-confirm-dialog";

describe("StoryDeleteConfirmDialog", () => {
  it("renders nothing when not open", () => {
    const { container } = render(
      <StoryDeleteConfirmDialog
        isOpen={false}
        storyTitle="Test"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows dialog with story title when open", () => {
    render(
      <StoryDeleteConfirmDialog
        isOpen={true}
        storyTitle="My Story"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/My Story/)).toBeInTheDocument();
    expect(screen.getByText("キャンセル")).toBeInTheDocument();
    expect(screen.getByText("削除する")).toBeInTheDocument();
  });

  it("calls onCancel when cancel button clicked", () => {
    const onCancel = vi.fn();
    render(
      <StoryDeleteConfirmDialog
        isOpen={true}
        storyTitle="Test"
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("キャンセル"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when delete button clicked", () => {
    const onConfirm = vi.fn();
    render(
      <StoryDeleteConfirmDialog
        isOpen={true}
        storyTitle="Test"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByText("削除する"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables buttons while deleting", () => {
    render(
      <StoryDeleteConfirmDialog
        isOpen={true}
        storyTitle="Test"
        isDeleting={true}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("キャンセル")).toBeDisabled();
    expect(screen.getByText("削除中...")).toBeDisabled();
  });

  it("calls onCancel on Escape key when not deleting", () => {
    const onCancel = vi.fn();
    render(
      <StoryDeleteConfirmDialog
        isOpen={true}
        storyTitle="Test"
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("dialog").parentElement!, {
      key: "Escape",
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
