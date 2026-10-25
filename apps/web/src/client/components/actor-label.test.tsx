import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ActorLabel } from "./actor-label";

describe("ActorLabel", () => {
  it("renders the avatar image and the name", () => {
    render(
      <ActorLabel
        displayName="Alice"
        avatarUrl="https://example.com/a.png"
        gravatarUrl={null}
      />,
    );

    expect(screen.getByRole("img", { name: "Alice" })).toHaveAttribute(
      "src",
      "https://example.com/a.png",
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("falls back to initials when no avatar is available", () => {
    render(
      <ActorLabel
        displayName="Alice Bob"
        avatarUrl={null}
        gravatarUrl={null}
      />,
    );

    expect(screen.getByLabelText("Alice Bob")).toHaveTextContent("AB");
    expect(screen.getByText("Alice Bob")).toBeInTheDocument();
  });
});
