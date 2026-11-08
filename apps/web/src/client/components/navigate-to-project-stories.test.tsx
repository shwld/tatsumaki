import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { expect, it } from "vitest";
import { NavigateToProjectStories } from "./navigate-to-project-stories";

function Probe() {
  const { pathname, search, hash } = useLocation();
  return <div data-testid="loc">{`${pathname}${search}${hash}`}</div>;
}

it("redirects the legacy stories URL to the project root keeping query and hash", () => {
  render(
    <MemoryRouter initialEntries={["/projects/p1/stories?labelIds=l1#12"]}>
      <Routes>
        <Route
          path="/projects/:projectId/stories"
          element={<NavigateToProjectStories />}
        />
        <Route path="/projects/:projectId" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByTestId("loc")).toHaveTextContent(
    "/projects/p1?labelIds=l1#12",
  );
});
