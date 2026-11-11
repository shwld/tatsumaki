import { expect, test } from "@playwright/test";
import {
  mockAuthMe,
  mockStoriesList,
  resolveSnapshotName,
  setThemeMode,
  themeVariants,
} from "./helpers";

function epicsProgress() {
  const counts = (total: number, accepted: number) => ({
    total,
    accepted,
    inProgress: Math.max(total - accepted - 1, 0),
    unstarted: total > accepted ? 1 : 0,
    icebox: 0,
    blocked: 0,
  });
  const epic = (
    id: string,
    name: string,
    color: string,
    start: string | null,
    end: string | null,
  ) => ({
    id: `epic-${id}`,
    projectId: "project-1",
    labelId: `label-${id}`,
    labelName: name,
    labelColor: color,
    enabled: true,
    description: id === "growth" ? "新規登録を増やす" : "",
    ownerIds: id === "growth" ? ["github|owner"] : [],
    plannedStart: start,
    plannedEnd: end,
    position: 0,
    outcomeStatus: "unevaluated",
    revision: 1,
    createdAt: "2026-01-01 00:00:00",
    updatedAt: "2026-01-01 00:00:00",
  });
  const progress = (total: number, accepted: number, overdue = false) => ({
    state:
      total === 0
        ? "no_stories"
        : accepted === total
          ? "completed"
          : "in_progress",
    storyCompletionRate: total === 0 ? null : accepted / total,
    stories: counts(total, accepted),
    pointCompletionRate: total === 0 ? null : accepted / total,
    points: {
      estimatedPoints: total * 2,
      acceptedPoints: accepted * 2,
      excludedStories: 0,
    },
    overdue,
  });
  return [
    {
      epic: epic("growth", "growth", "#2563eb", "2026-06-01", "2026-09-30"),
      progress: progress(10, 4),
    },
    {
      epic: epic("ops", "ops", "#16a34a", "2026-04-15", "2026-06-30"),
      progress: progress(5, 3, true),
    },
    {
      epic: epic("research", "research", "#9333ea", "2026-07-01", "2026-08-31"),
      progress: progress(0, 0),
    },
    {
      epic: epic("legacy", "legacy", "#6b7280", "2026-01-01", "2026-03-31"),
      progress: progress(8, 8),
    },
    {
      epic: epic("someday", "someday", "#f59e0b", null, null),
      progress: progress(2, 0),
    },
    {
      epic: epic("far", "far", "#db2777", "2027-02-01", "2027-03-31"),
      progress: progress(3, 1),
    },
  ];
}

function epicsProgressResponse() {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ epics: epicsProgress(), total: {} }),
  };
}

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
          members: [
            {
              userId: "github|owner",
              role: "owner",
              displayName: "Alice Owner",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            {
              userId: "github|viewer",
              role: "viewer",
              displayName: null,
              createdAt: "2026-01-02T00:00:00.000Z",
            },
          ],
          invitations: [],
          currentMemberRole: "owner",
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

  test(`project invitations screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await mockStoriesList(page);

    await page.route("**/api/projects/*/members", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          members: [
            {
              userId: "github|owner",
              role: "owner",
              displayName: "Alice Owner",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          invitations: [
            {
              id: "inv-1",
              projectId: "project-1",
              inviterUserId: "github|owner",
              targetUserId: null,
              targetEmail: "new-user@example.com",
              role: "member",
              status: "pending",
              expiresAt: "2099-01-08T00:00:00.000Z",
              acceptedByUserId: null,
              acceptedAt: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          currentMemberRole: "owner",
        }),
      });
    });

    await page.goto("/projects/project-1/members/invitations");
    await expect(
      page.getByRole("heading", { name: "メンバーの招待" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("project-invitations.png", theme),
    );
  });

  test(`project labels screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await mockStoriesList(page);

    const json = (body: unknown) => ({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    const label = (id: string, name: string, color: string) => ({
      __typename: "ProjectLabel",
      id,
      projectId: "project-1",
      name,
      color,
      createdAt: "2026-01-01 00:00:00",
      updatedAt: "2026-01-01 00:00:00",
    });
    await page.route("**/api/projects/project-1/labels", (route) =>
      route.fulfill(
        json({
          labels: [
            label("label-growth", "growth", "#2563eb"),
            label("label-ops", "ops", "#16a34a"),
          ],
        }),
      ),
    );
    await page.route("**/api/projects/project-1/members", (route) =>
      route.fulfill(
        json({
          currentMemberRole: "owner",
          members: [{ userId: "github|owner", displayName: "Owner" }],
        }),
      ),
    );
    await page.route("**/api/projects/project-1/epics", (route) =>
      route.fulfill(
        json({
          epics: [
            {
              id: "epic-growth",
              projectId: "project-1",
              labelId: "label-growth",
              labelName: "growth",
              labelColor: "#2563eb",
              enabled: true,
              description: "新規登録を増やす",
              ownerIds: ["github|owner"],
              plannedStart: "2026-04-01",
              plannedEnd: "2026-06-30",
              outcomeStatus: "unevaluated",
              revision: 2,
            },
          ],
        }),
      ),
    );

    await page.goto("/projects/project-1/labels");
    await expect(page.getByRole("heading", { name: "Labels" })).toBeVisible();
    await expect(page.getByLabel("目的")).toHaveValue("新規登録を増やす");
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("project-labels.png", theme),
    );
  });

  test(`project epics timeline screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await mockStoriesList(page);
    await page.route("**/api/projects/project-1/epics/progress", (route) =>
      route.fulfill(epicsProgressResponse()),
    );

    await page.goto("/projects/project-1/epics");
    await expect(page.getByRole("heading", { name: "Epics" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /growth: 2026-06-01/ }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("project-epics.png", theme),
    );
  });

  test(`project epic detail screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await mockStoriesList(page);
    await page.route("**/api/projects/project-1/members", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          currentMemberRole: "owner",
          members: [{ userId: "github|owner", displayName: "Owner" }],
        }),
      }),
    );
    await page.route(
      "**/api/projects/project-1/labels/label-growth/epic/progress",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(epicsProgress()[0]),
        }),
    );

    await page.goto("/projects/project-1/epics/label-growth");
    await expect(page.getByRole("heading", { name: "growth" })).toBeVisible();
    await expect(page.getByText("新規登録を増やす")).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("project-epic-detail.png", theme),
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

  test(`single-use invitation accept screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockAuthMe(page);
    await page.route("**/api/invitation-links/accept", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ projectId: "project-1" }),
      });
    });

    await page.goto("/invite#test-invitation-token");
    await expect(
      page.getByRole("heading", { name: "プロジェクト招待" }),
    ).toBeVisible();
    await expect(
      page.getByText("招待を承認しました。プロジェクトに参加しました。"),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("single-use-invitation-accept.png", theme),
    );
  });
}
