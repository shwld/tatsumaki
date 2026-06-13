import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AuthErrorProvider, useAuthError } from "./auth-error-context";

function TestConsumer() {
  const { authError, notifySessionExpired, notifyForbidden, clearAuthError } =
    useAuthError();

  return (
    <div>
      <span data-testid="kind">{authError.kind}</span>
      {"message" in authError ? (
        <span data-testid="message">{authError.message}</span>
      ) : null}
      <button onClick={notifySessionExpired}>expire</button>
      <button onClick={() => notifyForbidden("no access")}>forbid</button>
      <button onClick={clearAuthError}>clear</button>
    </div>
  );
}

describe("AuthErrorProvider", () => {
  it("starts with no auth error", () => {
    render(
      <AuthErrorProvider>
        <TestConsumer />
      </AuthErrorProvider>,
    );

    expect(screen.getByTestId("kind")).toHaveTextContent("none");
  });

  it("shows session expired banner on notifySessionExpired", () => {
    render(
      <AuthErrorProvider>
        <TestConsumer />
      </AuthErrorProvider>,
    );

    fireEvent.click(screen.getByText("expire"));

    expect(screen.getByTestId("kind")).toHaveTextContent("session-expired");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("sets forbidden state with message", () => {
    render(
      <AuthErrorProvider>
        <TestConsumer />
      </AuthErrorProvider>,
    );

    fireEvent.click(screen.getByText("forbid"));

    expect(screen.getByTestId("kind")).toHaveTextContent("forbidden");
    expect(screen.getByTestId("message")).toHaveTextContent("no access");
  });

  it("clears auth error", () => {
    render(
      <AuthErrorProvider>
        <TestConsumer />
      </AuthErrorProvider>,
    );

    fireEvent.click(screen.getByText("expire"));
    expect(screen.getByTestId("kind")).toHaveTextContent("session-expired");

    fireEvent.click(screen.getByText("clear"));
    expect(screen.getByTestId("kind")).toHaveTextContent("none");
  });

  it("throws when useAuthError is used outside provider", () => {
    expect(() => render(<TestConsumer />)).toThrow(
      "useAuthError must be used within AuthErrorProvider",
    );
  });
});
