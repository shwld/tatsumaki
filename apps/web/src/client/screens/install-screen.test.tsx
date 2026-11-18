import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { i18n } from "../i18n/config";
import { InstallScreen } from "./install-screen";

describe("InstallScreen", () => {
  afterEach(() => {
    void i18n.changeLanguage("ja");
  });

  it("explains CLI install in Japanese", async () => {
    await i18n.changeLanguage("ja");
    render(<InstallScreen />);
    expect(
      screen.getByRole("heading", { name: "CLI (tm)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/tm --version/, { selector: "p" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "CLI の詳細 (README)" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/shwld/tatsumaki/blob/main/apps/cli/README.md",
    );
  });

  it("distinguishes plugins from the Cursor Agent Skill", async () => {
    await i18n.changeLanguage("ja");
    render(<InstallScreen />);
    expect(
      screen.getByRole("heading", { name: "Codex (Plugin)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Claude Code (Plugin)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Cursor (Agent Skill)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("codex plugin marketplace add ."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Agent 連携の詳細" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/shwld/tatsumaki/blob/main/docs/agent-integrations.md",
    );
  });

  it("renders English copy", async () => {
    await i18n.changeLanguage("en");
    render(<InstallScreen />);
    expect(
      screen.getByRole("heading", { name: "Install" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Agent integration details" }),
    ).toBeInTheDocument();
  });
});
