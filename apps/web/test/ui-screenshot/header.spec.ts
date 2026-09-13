import { expect, test } from "@playwright/test";
import {
  mockAuthMe,
  mockStoriesList,
  mockStoriesResponse,
  setThemeMode,
  themeVariants,
} from "./helpers";

for (const theme of themeVariants) {
  for (const width of [1440, 390]) {
    test(`compact header scrolling (${theme}, ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await setThemeMode(page, theme);
      await mockAuthMe(page);
      await mockStoriesList(page);
      await page.route(
        "**/api/projects/project-1/stories?**",
        async (route) => {
          await route.fulfill({
            json: {
              stories: Array.from({ length: 60 }, (_, index) => ({
                ...mockStoriesResponse.stories[0],
                id: `header-story-${index}`,
                storyNumber: index + 1,
                title: `Header scroll story ${index + 1}`,
                position: index,
              })),
            },
          });
        },
      );
      await page.goto("/projects/project-1/stories");
      const header = page.getByTestId("app-header-container");
      const panel = page.getByTestId("panel-scroll-Current");
      await expect(
        panel.getByText("Header scroll story 1", { exact: true }),
      ).toBeVisible();
      const home = page.getByRole("link", { name: "tatsumaki", exact: true });
      const notification = page.getByRole("button", {
        name: "通知",
        exact: true,
      });
      const account = page.getByRole("button", {
        name: "ユーザーメニュー",
        exact: true,
      });
      await expect(home).toBeVisible();
      await expect(notification).toBeVisible();
      await expect(account).toBeVisible();
      await expect(
        page.getByTestId("app-header").getByText("tatsumaki", { exact: true }),
      ).toHaveCount(0);
      const homeBox = await home.boundingBox();
      const accountBox = await account.boundingBox();
      expect(homeBox!.x).toBeLessThan(20);
      expect(accountBox!.x + accountBox!.width).toBeGreaterThan(width - 20);
      await expect.soft(page).toHaveScreenshot(`header-${width}-${theme}.png`);

      await panel.hover();
      await page.mouse.wheel(0, 500);
      await expect(header).toHaveAttribute("data-hidden", "true");
      await expect
        .poll(async () => (await header.boundingBox())!.height)
        .toBe(0);
      await expect
        .soft(page)
        .toHaveScreenshot(`header-hidden-${width}-${theme}.png`);
      await page.mouse.wheel(0, -120);
      await expect(header).toHaveAttribute("data-hidden", "false");
      await expect(home).toBeInViewport();

      // A clamped scroll at the bottom must not reopen the collapsing header.
      await page.mouse.wheel(0, 10000);
      await expect(header).toHaveAttribute("data-hidden", "true");
      await expect
        .poll(async () => (await header.boundingBox())!.height)
        .toBe(0);
      await page.mouse.wheel(0, -10000);
      await expect(header).toHaveAttribute("data-hidden", "false");
      await expect
        .poll(async () => await panel.evaluate((el) => el.scrollTop))
        .toBe(0);

      await notification.click();
      await expect(page.getByRole("dialog", { name: "通知" })).toBeVisible();
      await page.keyboard.press("Escape");
      await account.click();
      await expect(
        page.getByRole("menuitem", { name: "ログアウト" }),
      ).toBeVisible();
    });
  }
}
