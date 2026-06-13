import { expect, test } from "@playwright/test";
import {
  mockAuthMe,
  mockProjectsResponse,
  resolveSnapshotName,
  setThemeMode,
  themeVariants,
} from "./helpers";

const mockProjectHistoryResponse = {
  history: [
    {
      __typename: "ProjectHistoryEntry",
      id: "01HQZV0M8DG1S2Q3R4T5U6V7A1",
      storyId: "01HQZV0M8DG1S2Q3R4T5U6V7S1",
      storyTitle: "Set up authentication",
      actorUserId: "github|owner",
      actorName: "user@example.com",
      action: "created",
      fieldName: "story",
      oldValue: null,
      newValue: "Set up authentication",
      createdAt: "2026-01-03T10:00:00.000Z",
    },
    {
      __typename: "ProjectHistoryEntry",
      id: "01HQZV0M8DG1S2Q3R4T5U6V7A2",
      storyId: "01HQZV0M8DG1S2Q3R4T5U6V7S1",
      storyTitle: "Set up authentication",
      actorUserId: "github|owner",
      actorName: "user@example.com",
      action: "field_changed",
      fieldName: "status",
      oldValue: "Unstarted",
      newValue: "Started",
      createdAt: "2026-01-03T12:00:00.000Z",
    },
  ],
  hasMore: false,
  nextCursor: null,
};

for (const theme of themeVariants) {
  test(`project history screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);

    await page.route("**/api/projects", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockProjectsResponse),
      });
    });

    // Query string (?limit=30 など) 付き URL でも一致させる（末尾 * が必須）
    await page.route("**/api/projects/*/history*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockProjectHistoryResponse),
      });
    });

    await page.goto("/projects/project-1/history");
    await expect(
      page.getByRole("heading", { name: "Project History" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "日時" }),
    ).toBeVisible();
    await expect(page.getByText("Set up authentication").first()).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("project-history.png", theme),
    );
  });
}
