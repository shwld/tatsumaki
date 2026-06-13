import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutoGrowSingleLineTextarea } from "./auto-grow-single-line-textarea";

describe("AutoGrowSingleLineTextarea", () => {
  it("submits on Enter when not composing", () => {
    const onEnterKey = vi.fn();

    render(
      <AutoGrowSingleLineTextarea
        value="title"
        onChange={vi.fn()}
        onEnterKey={onEnterKey}
        aria-label="title"
      />,
    );

    const input = screen.getByLabelText("title");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEnterKey).toHaveBeenCalledTimes(1);
  });

  it("does not submit on Enter during IME composition", () => {
    const onEnterKey = vi.fn();

    render(
      <AutoGrowSingleLineTextarea
        value="title"
        onChange={vi.fn()}
        onEnterKey={onEnterKey}
        aria-label="title"
      />,
    );

    const input = screen.getByLabelText("title");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(onEnterKey).not.toHaveBeenCalled();
  });

  it("does not submit on Enter when IME keyCode 229 is emitted", () => {
    const onEnterKey = vi.fn();

    render(
      <AutoGrowSingleLineTextarea
        value="title"
        onChange={vi.fn()}
        onEnterKey={onEnterKey}
        aria-label="title"
      />,
    );

    const input = screen.getByLabelText("title");
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });

    expect(onEnterKey).not.toHaveBeenCalled();
  });
});
