import type { FocusEventHandler } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EditableMarkdown } from "./editable-markdown";

vi.mock("./rich-text-editor", () => ({
  RichTextEditor: ({
    value,
    onChange,
    onBlur,
  }: {
    value: string;
    onChange: (value: string) => void;
    onBlur?: FocusEventHandler<HTMLDivElement>;
  }) => (
    <div onBlur={onBlur}>
      <textarea
        role="textbox"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  ),
}));

describe("EditableMarkdown", () => {
  it("renders textbox immediately", () => {
    render(<EditableMarkdown value="hello world" onSave={vi.fn()} />);

    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("shows placeholder when value is empty", () => {
    render(<EditableMarkdown value="" onSave={vi.fn()} />);

    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("does not call onSave when value unchanged", () => {
    const onSave = vi.fn();
    render(<EditableMarkdown value="same" onSave={onSave} />);

    fireEvent.blur(screen.getByRole("textbox"));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("cancels on Escape key", () => {
    const onSave = vi.fn();
    render(<EditableMarkdown value="original" onSave={onSave} />);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "changed" } });
    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("original");
  });
});
