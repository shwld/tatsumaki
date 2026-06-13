import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ProjectListItem } from "./project-list-item";

import type { Project } from "../types/project";

const project: Project = {
  id: "p1",
  name: "Test Project",
  description: "",
  isPublic: false,
  timezone: "Asia/Tokyo",
  sprintDurationDays: 14 as const,
  pointScaleType: "fibonacci" as const,
  customPointScale: null,
  estimateBugs: false,
  estimateChores: false,
  iterationStartDay: 1 as const,
  currentUserRole: "owner" as const,
};

describe("ProjectListItem", () => {
  it("renders project name and sprint duration", () => {
    render(
      <MemoryRouter>
        <ProjectListItem project={project} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Test Project")).toBeInTheDocument();
    expect(screen.getByText(/14日間/)).toBeInTheDocument();
  });

  it("renders navigation links", () => {
    render(
      <MemoryRouter>
        <ProjectListItem project={project} />
      </MemoryRouter>,
    );

    expect(screen.getByText("メンバー管理")).toBeInTheDocument();
    expect(screen.getByText("設定")).toBeInTheDocument();
    expect(screen.getByText("ストーリー")).toBeInTheDocument();
    expect(screen.getByText("ベロシティ")).toBeInTheDocument();
  });

  it("shows user role when present", () => {
    render(
      <MemoryRouter>
        <ProjectListItem project={project} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/owner/)).toBeInTheDocument();
  });

  it("hides role when absent", () => {
    render(
      <MemoryRouter>
        <ProjectListItem project={{ ...project, currentUserRole: undefined }} />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/あなたの役割/)).not.toBeInTheDocument();
  });
});
