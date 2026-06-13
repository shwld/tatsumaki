import { expect, test } from "@playwright/test";
import {
  mockAuthMe,
  mockStoriesList,
  resolveSnapshotName,
  setThemeMode,
  themeVariants,
} from "./helpers";

for (const theme of themeVariants) {
  test(`project members screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await mockStoriesList(page);

    await page.route("**/api/projects/*/members", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          members: [{ userId: "github|owner", role: "owner" }],
          invitations: [],
          currentUserRole: "owner",
        }),
      });
    });

    await page.goto("/projects/project-1/members");
    await expect(
      page.getByRole("heading", { name: "プロジェクトメンバー" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("project-members.png", theme),
    );
  });

  test(`project settings screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await mockStoriesList(page);

    await page.goto("/projects/project-1/settings");
    await expect(
      page.getByRole("heading", { name: "プロジェクト設定" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("project-settings.png", theme),
    );
  });

  test(`project api keys screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await mockStoriesList(page);

    await page.route("**/api/projects/*/api-keys", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          apiKeys: [
            {
              id: "key-1",
              projectId: "project-1",
              name: "CLI Key",
              keyPrefix: "tsk_live_abcd",
              scopes: ["story:write"],
              lastUsedAt: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      });
    });

    await page.goto("/projects/project-1/api-keys");
    await expect(
      page.getByRole("heading", { name: "APIキー管理" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("project-api-keys.png", theme),
    );
  });

  test(`account screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);

    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: "アカウント情報" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("account.png", theme),
    );
  });

  test(`project invitation accept screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);

    await page.route(
      "**/api/projects/*/invitations/*/accept",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            member: {
              __typename: "ProjectMember",
              projectId: "project-1",
              userId: "github|test-user",
              role: "member",
            },
            invitation: {
              id: "inv-1",
              projectId: "project-1",
              status: "accepted",
            },
          }),
        });
      },
    );

    await page.goto("/projects/project-1/invitations/inv-1/accept");
    await expect(
      page.getByRole("heading", { name: "プロジェクト招待" }),
    ).toBeVisible();
    await expect(
      page.getByText("招待を承認しました。プロジェクトに参加しました。"),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("project-invitation-accept.png", theme),
    );
  });
}
