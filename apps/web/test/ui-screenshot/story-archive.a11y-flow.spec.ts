import { expect, test } from "@playwright/test";
import { mockAuthMe, mockStoriesList, mockStoriesResponse } from "./helpers";

test("archive a story, find it in search, and restore it", async ({ page }) => {
  await mockAuthMe(page);
  await mockStoriesList(page);
  await page.route("**/api/projects/project-1/saved-filters", (route) =>
    route.fulfill({ json: { savedFilters: [] } }),
  );
  const initial = mockStoriesResponse.stories[1]!;
  let story = { ...initial, storyNumber: 2, archivedAt: null as string | null };
  await page.route("**/api/projects/project-1/stories**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/archive")) {
      story = { ...story, archivedAt: "2026-01-01T00:00:00.000Z" };
      return route.fulfill({ json: { story } });
    }
    if (url.pathname.endsWith("/unarchive")) {
      story = { ...story, archivedAt: null };
      return route.fulfill({ json: { story } });
    }
    if (url.pathname.endsWith("/2")) return route.fulfill({ json: { story } });
    if (!url.pathname.endsWith("/stories")) return route.fallback();
    const showArchived = url.searchParams.get("archived") === "only";
    const statuses = url.searchParams.get("statuses");
    const isBacklog =
      (!statuses || statuses.includes("Unstarted")) &&
      !url.searchParams.has("iterationId");
    const items =
      (story.archivedAt !== null) === showArchived &&
      isBacklog &&
      url.searchParams.get("isIcebox") !== "true"
        ? [story]
        : [];
    return route.fulfill({
      json: {
        stories: items,
        pagination: {
          total: items.length,
          hasNext: false,
          nextOffset: null,
          summary: { totalPoints: 0, pointsByIterationId: {} },
        },
      },
    });
  });
  await page.goto("/projects/project-1/stories");
  const card = page.getByTestId(`panel-story-${story.id}`);
  await expect(card).toBeVisible();
  await page
    .getByTestId(`panel-story-${story.id}`)
    .getByRole("button", { expanded: false })
    .first()
    .press("Enter");
  await page.getByTitle("アーカイブ", { exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByTestId("advanced-search-toggle").click();
  await page.getByPlaceholder(/is:archived/).fill("is:archived");
  await expect(card).toBeVisible();
  await expect(
    page
      .getByTestId(`panel-story-${story.id}`)
      .getByText("アーカイブ済み", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "アーカイブ解除" }).click();
  await expect(card).toHaveCount(0);
});
