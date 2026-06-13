import { expect, test } from "@playwright/test";
import {
  mockAuthMe,
  mockStoriesList,
  resolveSnapshotName,
  setThemeMode,
  themeVariants,
} from "./helpers";

for (const theme of themeVariants) {
  test(`story inline create form (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await mockStoriesList(page);

    await page.goto("/projects/project-1/stories");
    await expect(page.getByTestId("multi-panel-layout")).toBeVisible();
    await page.getByRole("button", { name: "+ Add Story" }).first().click();
    await expect(page.getByPlaceholder("タイトルを入力")).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("stories-inline-create.png", theme),
    );
  });

  test(`story panel screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await mockStoriesList(page);

    await page.goto("/projects/project-1/stories");
    await expect(page.getByTestId("panel-actions-toggle")).toBeVisible();
    await expect(page.getByTestId("panel-Current")).toBeVisible();
    await expect(page.getByTestId("panel-Backlog")).toBeVisible();
    await expect(
      page.getByTestId("panel-Backlog").getByText("Set up authentication"),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("stories-panels.png", theme),
    );
  });

  test(`story edit screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await mockStoriesList(page);

    await page.goto(
      "/projects/project-1/stories/01HQZV0M8DG1S2Q3R4T5U6V7S1/edit",
    );
    await expect(
      page.getByRole("heading", { name: "ストーリーを編集" }),
    ).toBeVisible();
    // 編集画面はアコーディオン詳細のみ（レガシーの「タイトル」textbox は無い）
    await expect(page.getByLabel("ステータス")).toHaveValue("Started");
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("stories-edit.png", theme),
    );
  });

  test(`project velocity screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await mockStoriesList(page);

    await page.goto("/projects/project-1/velocity");
    await expect(
      page.getByRole("heading", { name: "ベロシティダッシュボード" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("project-velocity.png", theme),
    );
  });
}
