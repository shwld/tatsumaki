import { describe, expect, it, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { ToastProvider, useToast } from "./toast-context";

function TestConsumer() {
  const { showToast } = useToast();

  return (
    <div>
      <button onClick={() => showToast("success", "操作が完了しました")}>
        show success
      </button>
      <button onClick={() => showToast("error", "操作に失敗しました")}>
        show error
      </button>
    </div>
  );
}

describe("ToastProvider", () => {
  it("shows a success toast and auto-dismisses", () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("show success"));

    expect(screen.getByText("操作が完了しました")).toBeInTheDocument();
    expect(screen.getByText("✓")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5000));

    expect(screen.queryByText("操作が完了しました")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("shows an error toast with distinct indicator", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("show error"));

    expect(screen.getByText("操作に失敗しました")).toBeInTheDocument();
    expect(screen.getByText("✗")).toBeInTheDocument();
  });

  it("dismisses toast on close button click", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("show success"));
    expect(screen.getByText("操作が完了しました")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("閉じる"));
    expect(screen.queryByText("操作が完了しました")).not.toBeInTheDocument();
  });
});
