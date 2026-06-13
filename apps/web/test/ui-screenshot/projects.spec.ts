import { expect, test } from "@playwright/test";
import {
  mockAuthMe,
  resolveSnapshotName,
  setThemeMode,
  themeVariants,
} from "./helpers";

for (const theme of themeVariants) {
  test(`project create screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await page.goto("/projects/new");
    await expect(
      page.getByRole("heading", { name: "プロジェクトを作成" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ユーザーメニュー" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("projects-new.png", theme),
    );
  });

  test(`project create loading state is visible on mobile (${theme})`, async ({
    page,
  }) => {
    await setThemeMode(page, theme);
    await page.setViewportSize({ width: 390, height: 844 });
    await mockAuthMe(page);
    await page.route("**/api/projects", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            project: {
              id: "01HQZV0M8DG1S2Q3R4T5U6V7WA",
              name: "Mobile Project",
              createdAt: "2026-01-03T00:00:00.000Z",
              updatedAt: "2026-01-03T00:00:00.000Z",
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ projects: [] }),
      });
    });

    await page.goto("/projects/new");
    await page.getByLabel("プロジェクト名").fill("Mobile Project");
    await page.getByRole("button", { name: "プロジェクトを作成" }).click();

    await expect(
      page.getByRole("button", { name: "作成中..." }),
    ).toBeDisabled();
    await expect(page.getByLabel("プロジェクト名")).toBeDisabled();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("projects-new-loading-mobile.png", theme),
    );
    await expect(
      page.getByRole("heading", { name: "プロジェクト" }),
    ).toBeVisible();
  });

  test(`project list screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await page.route("**/api/projects", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projects: [
            {
              id: "01HQZV0M8DG1S2Q3R4T5U6V7W8",
              name: "Alpha Project",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              id: "01HQZV0M8DG1S2Q3R4T5U6V7W9",
              name: "Beta Project",
              createdAt: "2026-01-02T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z",
            },
          ],
        }),
      });
    });

    await page.goto("/projects");
    await expect(
      page.getByRole("heading", { name: "プロジェクト" }),
    ).toBeVisible();
    await expect(page.getByText("Alpha Project")).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("projects-list.png", theme),
    );
  });
}
