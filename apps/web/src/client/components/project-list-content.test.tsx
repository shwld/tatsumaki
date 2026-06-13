import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ProjectListContent } from "./project-list-content";

describe("ProjectListContent", () => {
  it("shows loading message while loading", () => {
    render(<ProjectListContent projects={[]} isLoading error={null} />);

    expect(screen.getByText("プロジェクトを読み込み中...")).toBeInTheDocument();
  });

  it("shows error message when request failed", () => {
    render(
      <ProjectListContent
        projects={[]}
        isLoading={false}
        error="Request failed"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Request failed");
  });

  it("shows empty-state guidance when there are no projects", () => {
    render(
      <MemoryRouter>
        <ProjectListContent projects={[]} isLoading={false} error={null} />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("プロジェクトがまだありません"),
    ).toBeInTheDocument();
    const createProjectLink = screen.getByRole("link", {
      name: "プロジェクトを作成",
    });
    expect(createProjectLink).toHaveAttribute("href", "/projects/new");
    expect(createProjectLink).toHaveClass("w-full");
    expect(createProjectLink).toHaveClass("min-h-11");
  });

  it("renders project list when loaded", () => {
    render(
      <MemoryRouter>
        <ProjectListContent
          projects={[
            {
              id: "01",
              name: "Alpha",
              description: "",
              isPublic: false,
              timezone: "Asia/Tokyo",
              sprintDurationDays: 14,
              pointScaleType: "fibonacci" as const,
              customPointScale: null,
              estimateBugs: true,
              estimateChores: true,
              iterationStartDay: 1,
            },
            {
              id: "02",
              name: "Beta",
              description: "",
              isPublic: false,
              timezone: "Asia/Tokyo",
              sprintDurationDays: 7,
              pointScaleType: "fibonacci" as const,
              customPointScale: null,
              estimateBugs: true,
              estimateChores: true,
              iterationStartDay: 1,
            },
          ]}
          isLoading={false}
          error={null}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(
      screen.getByText("スプリント期間: 14日間（2週間）"),
    ).toBeInTheDocument();
  });
});
