import { expect, test } from "@playwright/test";
import {
  mockAuthMe,
  resolveSnapshotName,
  setThemeMode,
  themeVariants,
} from "./helpers";

for (const theme of themeVariants) {
  test(`install screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);

    await page.goto("/install");
    await expect(page.getByRole("heading", { name: "CLI (tm)" })).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("install.png", theme),
    );
  });
}
