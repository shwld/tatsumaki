import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "../i18n/config";
import { ActorLabel } from "./actor-label";

const alice = {
  id: "u1",
  displayName: "Alice",
  avatarUrl: "https://example.com/a.png",
  gravatarUrl: null,
};

describe("ActorLabel", () => {
  it("renders the member avatar and name", () => {
    render(<ActorLabel member={alice} actorName="old-name" />);

    expect(screen.getByRole("img", { name: "Alice" })).toHaveAttribute(
      "src",
      "https://example.com/a.png",
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("falls back to initials with the stored readable name when unresolved", () => {
    render(<ActorLabel member={undefined} actorName="Alice Bob" />);

    expect(screen.getByLabelText("Alice Bob")).toHaveTextContent("AB");
    expect(screen.getByText("Alice Bob")).toBeInTheDocument();
  });

  it.each([
    ["email", "alice@example.com"],
    ["uuid", "123e4567-e89b-12d3-a456-426614174000"],
    ["ulid", "01KN9P32R248P2PK1413DKQQG5"],
    ["empty", "  "],
    ["null", null],
  ])("shows the unknown-user label for %s actorName", (_, actorName) => {
    render(<ActorLabel member={undefined} actorName={actorName} />);

    expect(screen.getByText("不明なユーザー")).toBeInTheDocument();
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
  });
});
