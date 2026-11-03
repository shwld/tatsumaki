import { expect, test } from "@playwright/test";
import { mockAuthMe, mockStoriesList, mockStoriesResponse } from "./helpers";

test("archived story details", async ({ page }) => {
  await mockAuthMe(page);
  await mockStoriesList(page);
  const story = {
    ...mockStoriesResponse.stories[1]!,
    storyNumber: 2,
    archivedAt: "2026-06-01T00:00:00.000Z",
  };
  await page.route("**/api/projects/project-1/stories/2", (route) =>
    route.fulfill({ json: { story } }),
  );
  await page.goto("/projects/project-1/stories/2");
  await expect(page.getByText("アーカイブ済み", { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot("story-archive-details.png");
});
