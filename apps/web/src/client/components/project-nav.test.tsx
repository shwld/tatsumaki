import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Layout } from "./layout";
import { resetProjectNavCacheForTests } from "./project-nav";

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
}

function setup(path: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input) === "/api/projects") {
      return new Response(
        JSON.stringify({ projects: [{ id: "p1", name: "Alpha" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(null, { status: 401 });
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <Layout>
        <div />
      </Layout>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetProjectNavCacheForTests();
  setWidth(1280);
});
afterEach(() => vi.restoreAllMocks());

it("shows the same menu with project name on non-stories project screens and marks the current page", async () => {
  setup("/projects/p1/history");
  const nav = screen.getByRole("navigation", { name: "プロジェクトメニュー" });
  expect(nav).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByTestId("project-nav-name")).toHaveTextContent("Alpha"),
  );
  expect(screen.getByRole("link", { name: "Stories" })).toHaveAttribute(
    "href",
    "/projects/p1/stories",
  );
  expect(screen.getByRole("link", { name: "Project History" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("link", { name: "設定" })).not.toHaveAttribute(
    "aria-current",
  );
});

it("marks Stories as current on story detail screens", () => {
  setup("/projects/p1/stories/12");
  expect(screen.getByRole("link", { name: "Stories" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

it("is not rendered outside project routes", () => {
  setup("/projects");
  expect(
    screen.queryByRole("navigation", { name: "プロジェクトメニュー" }),
  ).toBeNull();
});

it("collapses into a dropdown on small widths", async () => {
  setWidth(375);
  setup("/projects/p1/members");
  expect(screen.queryByRole("link", { name: "Stories" })).toBeNull();
  await userEvent.click(screen.getByTestId("project-nav-toggle"));
  expect(
    await screen.findByRole("menuitem", { name: "Stories" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "メンバー" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
