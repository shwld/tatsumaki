import { expect, test } from "@playwright/test";
import {
  mockAuthMe,
  resolveSnapshotName,
  setThemeMode,
  themeVariants,
} from "./helpers";

for (const theme of themeVariants) {
  test(`planning poker route removed screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);

    await page.goto("/projects/project-1/planning-poker");
    await expect(page.getByText("404 Not Found")).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("planning-poker.png", theme),
    );
  });
}
