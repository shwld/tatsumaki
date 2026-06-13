import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionDenied } from "./permission-denied";
import { i18n } from "../i18n/config";

describe("PermissionDenied", () => {
  beforeEach(() => {
    void i18n.changeLanguage("ja");
  });

  it("shows translated default guidance in Japanese", () => {
    render(
      <MemoryRouter>
        <PermissionDenied />
      </MemoryRouter>,
    );

    expect(screen.getByText("403 Forbidden")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "権限が不足しています" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("この操作を実行する権限がありません。"),
    ).toBeInTheDocument();
    expect(screen.getByText("次にできること")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "プロジェクト一覧へ戻る" }),
    ).toHaveAttribute("href", "/projects");
  });

  it("shows translated default guidance in English", async () => {
    await i18n.changeLanguage("en");

    render(
      <MemoryRouter>
        <PermissionDenied />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Permission required" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You do not have permission to perform this action."),
    ).toBeInTheDocument();
    expect(screen.getByText("What you can do next")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to projects" }),
    ).toHaveAttribute("href", "/projects");
  });

  it("shows recovery guidance and mobile-friendly actions", () => {
    const onRetry = vi.fn();

    render(
      <MemoryRouter>
        <PermissionDenied
          message="このプロジェクトの編集権限がありません。"
          nextAction="プロジェクト編集権限を申請するか、管理者に変更の代行を依頼してください。"
          retryHint="入力内容を保持したまま、この画面から再試行できます。"
          onRetry={onRetry}
          retryLabel="入力内容を保持して再試行"
          backTo="/projects"
          backLabel="プロジェクト一覧へ戻る"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("403 Forbidden")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "権限が不足しています" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("このプロジェクトの編集権限がありません。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /プロジェクト編集権限を申請するか、管理者に変更の代行を依頼してください。/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/入力内容を保持したまま、この画面から再試行できます。/),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", {
      name: "入力内容を保持して再試行",
    });
    expect(retryButton).toHaveClass("min-h-11", "w-full", "sm:w-auto");

    const backLink = screen.getByRole("link", {
      name: "プロジェクト一覧へ戻る",
    });
    expect(backLink).toHaveAttribute("href", "/projects");
    expect(backLink).toHaveClass("min-h-11", "w-full", "sm:w-auto");

    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
