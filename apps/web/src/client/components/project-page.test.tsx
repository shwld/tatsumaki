import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectPage } from "./project-page";

describe("ProjectPage", () => {
  it("renders heading and body in a full-width main", () => {
    render(
      <ProjectPage title="Sample">
        <p>body</p>
      </ProjectPage>,
    );

    expect(screen.getByRole("heading", { name: "Sample" })).toHaveClass(
      "text-xl",
      "font-semibold",
    );
    expect(screen.getByText("body")).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(main).toHaveClass("px-4", "py-6");
    expect(main.className).not.toMatch(/max-w-/);
  });

  it("renders the actions area when provided", () => {
    render(
      <ProjectPage title="Sample" actions={<button type="button">Act</button>}>
        <p>body</p>
      </ProjectPage>,
    );

    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
  });
});
