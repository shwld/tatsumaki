import { expect, test } from "@playwright/test";
import { resolveSnapshotName, setThemeMode, themeVariants } from "./helpers";

for (const theme of themeVariants) {
  test(`login screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "ログイン" })).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("login.png", theme),
    );
  });
}
