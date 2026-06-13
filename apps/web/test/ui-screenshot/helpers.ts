import type { Page } from "@playwright/test";

export type ThemeVariant = "light" | "dark";
export const themeVariants: ThemeVariant[] = ["light", "dark"];

export const resolveSnapshotName = (
  baseName: string,
  theme: ThemeVariant,
): string => {
  if (theme === "light") {
    return baseName;
  }
  return baseName.replace(".png", "-dark.png");
};

export const setThemeMode = async (page: Page, theme: ThemeVariant) => {
  await page.addInitScript((mode: ThemeVariant) => {
    localStorage.setItem("tatsumaki:theme-mode", mode);
    document.documentElement.dataset.theme = mode;
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, theme);
};

export const mockStoriesResponse = {
  stories: [
    {
      __typename: "Story",
      id: "01HQZV0M8DG1S2Q3R4T5U6V7S1",
      projectId: "project-1",
      title: "Set up authentication",
      description: "Add initial email/password authentication flow.",
      type: "feature",
      status: "Started",
      statusChangedAt: "2026-01-03T00:00:00.000Z",
      storyPoint: 3,
      labels: ["backend", "security"],
      iterationId: "iter-current",
      isIcebox: false,
      ownerIds: ["github|owner"],
      requesterId: "github|owner",
      blockingStories: [],
      blockedStories: [],
      position: 1,
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
    },
    {
      __typename: "Story",
      id: "01HQZV0M8DG1S2Q3R4T5U6V7S2",
      projectId: "project-1",
      title: "Fix backlog reordering bug",
      description: "Ensure drag-and-drop reorder is persisted.",
      type: "bug",
      status: "Unstarted",
      statusChangedAt: "2026-01-05T00:00:00.000Z",
      storyPoint: null,
      labels: ["frontend", "priority:high", "ux"],
      iterationId: null,
      isIcebox: false,
      ownerIds: ["github|dev"],
      requesterId: "github|owner",
      blockingStories: [],
      blockedStories: [],
      position: 2,
      createdAt: "2026-01-04T00:00:00.000Z",
      updatedAt: "2026-01-05T00:00:00.000Z",
    },
  ],
};

export const mockProjectsResponse = {
  projects: [
    {
      id: "project-1",
      name: "Alpha Project",
      sprintDurationDays: 14,
    },
  ],
};

const screenshotReferenceDate = new Date("2026-06-05T00:00:00.000Z");

export const mockPriorityHistoryResponse = {
  history: [
    {
      __typename: "StoryPriorityHistory",
      id: "01HQZV0M8DG1S2Q3R4T5U6V7H1",
      storyId: "01HQZV0M8DG1S2Q3R4T5U6V7S2",
      fromPosition: 1,
      toPosition: 2,
      changedAt: "2026-01-06T12:00:00.000Z",
    },
  ],
};

export const mockAuthMe = async (page: Page) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "github|user",
        displayName: "user",
        email: "user@example.com",
      }),
    });
  });

  await page.route("**/api/auth/me/notification-settings", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        userId: "github|user",
        emailEnabled: true,
        targetScope: "assigned_only",
        notifyOnStatusChanged: true,
        notifyOnComment: true,
        notifyOnEstimate: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    });
  });
};

export const mockStoriesList = async (page: Page) => {
  const today = screenshotReferenceDate;
  const start = new Date(today);
  start.setDate(today.getDate() - 3);
  const end = new Date(today);
  end.setDate(today.getDate() + 10);
  const toDate = (value: Date) => value.toISOString().slice(0, 10);

  await page.route("**/api/projects", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockProjectsResponse),
    });
  });

  await page.route("**/api/projects/*/stories**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname.endsWith("/timeline")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          timeline: [],
          hasMore: false,
          nextCursor: null,
        }),
      });
      return;
    }

    const singleMatch = pathname.match(
      /\/api\/projects\/[^/]+\/stories\/([^/]+)$/,
    );
    if (singleMatch && route.request().method() === "GET") {
      const storyId = singleMatch[1];
      const story = mockStoriesResponse.stories.find(
        (item) => item.id === storyId,
      );
      if (story) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ story }),
        });
        return;
      }
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockStoriesResponse),
    });
  });

  await page.route("**/api/projects/*/members", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        members: [{ userId: "github|owner" }, { userId: "github|dev" }],
      }),
    });
  });

  await page.route("**/api/projects/*/labels", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ labels: [] }),
    });
  });

  await page.route("**/api/projects/*/iterations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        iterations: [
          {
            id: "iter-current",
            projectId: "project-1",
            startDate: toDate(start),
            endDate: toDate(end),
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        velocity: 8,
      }),
    });
  });

  await page.route("**/api/projects/*/iterations/*/burndown", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        iterationId: "iter-current",
        startDate: toDate(start),
        endDate: toDate(end),
        burndownScopePoints: 13,
        days: [
          {
            date: toDate(start),
            idealRemaining: 13,
            actualRemaining: 13,
          },
          {
            date: toDate(new Date(start.getTime() + 24 * 60 * 60 * 1000)),
            idealRemaining: 11,
            actualRemaining: 10,
          },
          {
            date: toDate(new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000)),
            idealRemaining: 9,
            actualRemaining: 8,
          },
          {
            date: toDate(new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000)),
            idealRemaining: 7,
            actualRemaining: null,
          },
          {
            date: toDate(new Date(start.getTime() + 4 * 24 * 60 * 60 * 1000)),
            idealRemaining: 5,
            actualRemaining: null,
          },
          {
            date: toDate(new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000)),
            idealRemaining: 3,
            actualRemaining: null,
          },
          {
            date: toDate(new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)),
            idealRemaining: 0,
            actualRemaining: null,
          },
        ],
      }),
    });
  });

  await page.route(/\/api\/projects\/[^/]+$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        project: {
          id: "project-1",
          name: "Alpha Project",
          sprintDurationDays: 14,
          pointScaleType: "fibonacci",
          customPointScale: null,
          pointScale: [0, 1, 2, 3, 5, 8, 13],
        },
      }),
    });
  });
};
