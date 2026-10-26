import { expect, test, type Page } from "@playwright/test";
import {
  mockAuthMe,
  mockProjectsResponse,
  resolveSnapshotName,
  setThemeMode,
  themeVariants,
} from "./helpers";

test.use({ timezoneId: "UTC", locale: "ja-JP" });

type ArtifactFixture = {
  id: string;
  projectId: string;
  title: string;
  archivedAt: string | null;
  latestVersion: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

const artifact: ArtifactFixture = {
  id: "art-1",
  projectId: "project-1",
  title: "Release report",
  archivedAt: null,
  latestVersion: 2,
  createdBy: "github|owner",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};

const versionOf = (version: number) => ({
  artifactId: "art-1",
  version,
  entrypoint: "index.html",
  treeDigest: "digest",
  fileCount: 3,
  totalBytes: 2048,
  createdBy: "github|owner",
  createdAt: "2026-01-02T00:00:00.000Z",
});

const FRAME_HTML = `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;margin:24px;background:#fff;color:#111"><h1>Artifact content</h1><p>Rendered inside the sandboxed frame.</p></body>`;

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

type Setup = {
  artifact?: ArtifactFixture;
  detailStatus?: number;
  versions?: ReturnType<typeof versionOf>[];
  tokenExpiresAt?: string;
};

async function mockArtifactApi(page: Page, setup: Setup = {}) {
  await mockAuthMe(page);
  await page.route("**/api/projects", (route) =>
    route.fulfill(json(mockProjectsResponse)),
  );
  await page.route("**/api/projects/project-1/members", (route) =>
    route.fulfill(
      json({
        members: [
          {
            userId: "github|owner",
            displayName: "Alice",
            profileResolved: true,
          },
        ],
      }),
    ),
  );
  await page.route("**/api/projects/project-1/artifacts", (route) =>
    route.fulfill(
      json({
        artifacts: [
          artifact,
          {
            ...artifact,
            id: "art-2",
            title: "Design notes",
            latestVersion: 1,
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      }),
    ),
  );
  await page.route("**/api/projects/project-1/artifacts/art-1", (route) =>
    setup.detailStatus
      ? route.fulfill(json({ error: "Artifact not found" }, setup.detailStatus))
      : route.fulfill(
          json({
            artifact: setup.artifact ?? artifact,
            latestVersion:
              (setup.artifact ?? artifact).latestVersion === null
                ? null
                : versionOf(2),
          }),
        ),
  );
  await page.route(
    "**/api/projects/project-1/artifacts/art-1/versions",
    (route) =>
      setup.detailStatus
        ? route.fulfill(
            json({ error: "Artifact not found" }, setup.detailStatus),
          )
        : route.fulfill(
            json({ versions: setup.versions ?? [versionOf(2), versionOf(1)] }),
          ),
  );
  await page.route(
    "**/api/projects/project-1/artifacts/art-1/versions/*/preview-token",
    (route) =>
      route.fulfill(
        json({
          token: "t",
          expiresAt:
            setup.tokenExpiresAt ??
            new Date(Date.now() + 600_000).toISOString(),
          contentPath: "/artifact-content/t/index.html",
        }),
      ),
  );
  await page.route("**/artifact-content/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: FRAME_HTML,
    }),
  );
}

for (const theme of themeVariants) {
  test(`artifact list screen (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockArtifactApi(page);

    await page.goto("/projects/project-1/artifacts");
    await expect(
      page.getByRole("link", { name: "Release report" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("artifact-list.png", theme),
    );
  });

  test(`artifact detail screen, latest version (${theme})`, async ({
    page,
  }) => {
    await setThemeMode(page, theme);
    await mockArtifactApi(page);

    await page.goto("/projects/project-1/artifacts/art-1");
    await expect(
      page.frameLocator("iframe").getByText("Artifact content"),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("artifact-detail-latest.png", theme),
    );
  });

  test(`artifact detail screen, older fixed version (${theme})`, async ({
    page,
  }) => {
    await setThemeMode(page, theme);
    await mockArtifactApi(page);

    await page.goto("/projects/project-1/artifacts/art-1/versions/1");
    await expect(page.getByText("最新版ではありません。")).toBeVisible();
    await expect(
      page.frameLocator("iframe").getByText("Artifact content"),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("artifact-detail-fixed.png", theme),
    );
  });

  test(`artifact detail screen, archived (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockArtifactApi(page, {
      artifact: { ...artifact, archivedAt: "2026-01-04T00:00:00.000Z" },
    });

    await page.goto("/projects/project-1/artifacts/art-1");
    await expect(page.getByText("アーカイブ済み")).toBeVisible();
    await expect(
      page.frameLocator("iframe").getByText("Artifact content"),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("artifact-detail-archived.png", theme),
    );
  });

  test(`artifact detail screen, expired preview (${theme})`, async ({
    page,
  }) => {
    await setThemeMode(page, theme);
    await mockArtifactApi(page, { tokenExpiresAt: "2020-01-01T00:00:00.000Z" });

    await page.goto("/projects/project-1/artifacts/art-1");
    await expect(
      page.getByText("プレビューの有効期限が切れました。"),
    ).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("artifact-detail-expired.png", theme),
    );
  });

  test(`artifact detail screen, not found (${theme})`, async ({ page }) => {
    await setThemeMode(page, theme);
    await mockArtifactApi(page, { detailStatus: 404 });

    await page.goto("/projects/project-1/artifacts/art-1");
    await expect(page.getByText(/Artifact が見つかりません/)).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("artifact-detail-not-found.png", theme),
    );
  });

  test(`artifact detail screen, no published version (${theme})`, async ({
    page,
  }) => {
    await setThemeMode(page, theme);
    await mockArtifactApi(page, {
      artifact: { ...artifact, latestVersion: null },
      versions: [],
    });

    await page.goto("/projects/project-1/artifacts/art-1");
    await expect(page.getByText(/まだ公開された版がありません/)).toBeVisible();
    await expect(page).toHaveScreenshot(
      resolveSnapshotName("artifact-detail-no-version.png", theme),
    );
  });
}
