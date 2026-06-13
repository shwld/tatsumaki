import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorRetry } from "./error-retry";
import { i18n } from "../i18n/config";

describe("ErrorRetry", () => {
  beforeEach(() => {
    void i18n.changeLanguage("ja");
  });

  it("displays error message and retry button", () => {
    render(<ErrorRetry message="Failed to load" onRetry={async () => {}} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load");
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });

  it("shows English retry labels", async () => {
    await i18n.changeLanguage("en");
    let resolveRetry!: () => void;
    const retryFn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
    );

    render(<ErrorRetry message="Error occurred" onRetry={retryFn} />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Retrying..." }),
      ).toBeDisabled();
    });

    resolveRetry();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).not.toBeDisabled();
    });
  });

  it("shows retrying state and disables button during retry", async () => {
    let resolveRetry!: () => void;
    const retryFn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
    );

    render(<ErrorRetry message="Error occurred" onRetry={retryFn} />);

    fireEvent.click(screen.getByRole("button", { name: "再試行" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "再試行中..." }),
      ).toBeDisabled();
    });

    resolveRetry();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "再試行" })).not.toBeDisabled();
    });
    expect(retryFn).toHaveBeenCalledTimes(1);
  });

  it("prevents double-click during retry", async () => {
    let resolveRetry!: () => void;
    const retryFn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
    );

    render(<ErrorRetry message="Error" onRetry={retryFn} />);

    const button = screen.getByRole("button", { name: "再試行" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    fireEvent.click(button);
    expect(retryFn).toHaveBeenCalledTimes(1);

    resolveRetry();
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });
});
