import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProjectSidebar } from "./project-sidebar";

const defaultVisibility = {
  Done: false,
  Current: true,
  Backlog: true,
  Icebox: false,
};

describe("ProjectSidebar", () => {
  it("renders all panel toggles", () => {
    render(
      <ProjectSidebar visibility={defaultVisibility} onToggle={vi.fn()} />,
    );

    expect(screen.getByTestId("panel-toggle-Done")).not.toBeChecked();
    expect(screen.getByTestId("panel-toggle-Current")).toBeChecked();
    expect(screen.getByTestId("panel-toggle-Backlog")).toBeChecked();
    expect(screen.getByTestId("panel-toggle-Icebox")).not.toBeChecked();
  });

  it("calls onToggle with panel name when checkbox clicked", () => {
    const onToggle = vi.fn();
    render(
      <ProjectSidebar visibility={defaultVisibility} onToggle={onToggle} />,
    );

    fireEvent.click(screen.getByTestId("panel-toggle-Done"));
    expect(onToggle).toHaveBeenCalledWith("Done");
  });

  it("displays panel labels", () => {
    render(
      <ProjectSidebar visibility={defaultVisibility} onToggle={vi.fn()} />,
    );

    expect(screen.getByText("Current Iteration")).toBeInTheDocument();
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("Icebox")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});
