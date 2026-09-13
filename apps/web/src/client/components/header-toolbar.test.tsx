import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Link } from "react-router";
import { afterEach, it, expect, vi } from "vitest";
import { Layout } from "./layout";
import { HeaderToolbar } from "./header-toolbar";

function setup() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 401 }),
  );
  render(
    <MemoryRouter>
      <Layout>
        <HeaderToolbar>
          <Link to="/next">Toolbar navigation</Link>
        </HeaderToolbar>
        <div data-header-scroll data-testid="first" />
        <div data-header-scroll data-testid="second" />
        <div data-testid="unrelated" />
      </Layout>
    </MemoryRouter>,
  );
  for (const id of ["first", "second", "unrelated"]) {
    Object.defineProperties(screen.getByTestId(id), {
      scrollHeight: { value: 1000 },
      clientHeight: { value: 200 },
    });
  }
  return screen.getByTestId("app-header-container");
}
function scroll(id: string, top: number) {
  fireEvent.scroll(screen.getByTestId(id), { target: { scrollTop: top } });
}
afterEach(() => vi.restoreAllMocks());

it("places toolbar between the home link and account controls without a second header", () => {
  setup();
  const header = screen.getByTestId("app-header");
  expect(header).toContainElement(
    screen.getByRole("link", { name: "Toolbar navigation" }),
  );
  expect(screen.getAllByRole("banner")).toHaveLength(1);
});

it("hides on panel scrolling down and reveals on sustained upward scrolling or at the top", () => {
  const header = setup();
  expect(header).toHaveAttribute("data-hidden", "false");
  scroll("first", 120);
  expect(header).toHaveAttribute("data-hidden", "true");
  scroll("first", 118);
  scroll("first", 115);
  expect(header).toHaveAttribute("data-hidden", "true");
  scroll("first", 105);
  expect(header).toHaveAttribute("data-hidden", "false");
  scroll("first", 160);
  expect(header).toHaveAttribute("data-hidden", "true");
  scroll("first", 0);
  expect(header).toHaveAttribute("data-hidden", "false");
});

it("tracks panels independently and ignores unrelated scrolling", () => {
  const header = setup();
  scroll("first", 200);
  scroll("second", 30);
  expect(header).toHaveAttribute("data-hidden", "true");
  scroll("unrelated", 0);
  expect(header).toHaveAttribute("data-hidden", "true");
  scroll("second", 10);
  expect(header).toHaveAttribute("data-hidden", "false");
});

it("reveals a hidden portal toolbar on keyboard focus and keeps it visible while focused", () => {
  const header = setup();
  scroll("first", 100);
  expect(header).toHaveAttribute("data-hidden", "true");
  act(() => screen.getByRole("link", { name: "Toolbar navigation" }).focus());
  expect(header).toHaveAttribute("data-hidden", "false");
  scroll("first", 200);
  expect(header).toHaveAttribute("data-hidden", "false");
});

it("reveals the header after navigation", () => {
  const header = setup();
  scroll("first", 100);
  fireEvent.click(screen.getByRole("link", { name: "Toolbar navigation" }));
  expect(header).toHaveAttribute("data-hidden", "false");
});
