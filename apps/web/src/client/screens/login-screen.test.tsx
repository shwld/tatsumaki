import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginScreen } from "./login-screen";

describe("LoginScreen", () => {
  it("renders the app title", () => {
    render(<LoginScreen />);
    expect(
      screen.getByRole("heading", { name: "tatsumaki" }),
    ).toBeInTheDocument();
  });

  it("renders a login link", () => {
    render(<LoginScreen />);
    const link = screen.getByRole("link", { name: "ログイン" });
    expect(link).toHaveAttribute("href", "/cdn-cgi/access/login");
  });

  it("shows sign-in prompt", () => {
    render(<LoginScreen />);
    expect(screen.getByText(/サインイン/)).toBeInTheDocument();
  });

  it("shows password reset guidance for Cloudflare Access", () => {
    render(<LoginScreen />);
    expect(
      screen.getByRole("heading", { name: "パスワードを忘れた場合" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "パスワードリセットを開始する" }),
    ).toHaveAttribute("href", "/cdn-cgi/access/login");
  });
});
