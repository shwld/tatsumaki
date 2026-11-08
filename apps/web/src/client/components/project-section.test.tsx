import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectSection } from "./project-section";

describe("ProjectSection", () => {
  it("renders a readable-width card with a shared heading style", () => {
    render(
      <ProjectSection title="Keys">
        <p>body</p>
      </ProjectSection>,
    );

    expect(screen.getByRole("heading", { name: "Keys" })).toHaveClass(
      "text-base",
      "font-semibold",
    );
    expect(screen.getByRole("region", { name: "Keys" })).toHaveClass(
      "max-w-3xl",
      "rounded-md",
      "border",
    );
  });

  it("does not limit width when full is requested", () => {
    render(
      <ProjectSection title="Table" width="full">
        <p>body</p>
      </ProjectSection>,
    );

    expect(screen.getByRole("region", { name: "Table" }).className).not.toMatch(
      /max-w-/,
    );
  });

  it("uses danger tone colors", () => {
    render(
      <ProjectSection title="Danger" tone="danger">
        <p>body</p>
      </ProjectSection>,
    );

    expect(screen.getByRole("heading", { name: "Danger" })).toHaveClass(
      "text-red-900",
    );
  });
});
