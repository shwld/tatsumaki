import { expect, test, type Page } from "@playwright/test";
import { mockAuthMe, mockStoriesList } from "./helpers";

type MapState = {
  id: string;
  title: string;
  achievementGoal: string;
  archivedAt: string | null;
  personas: { id: string; name: string; position: number }[];
};

// A tiny in-memory stand-in for the story map API, so the flow below checks
// that each screen sends what the next screen reads back after a reload.
async function mockStoryMapApi(page: Page, role: "owner" | "viewer") {
  const maps: MapState[] = [];
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  const toMap = (map: MapState) => ({
    __typename: "StoryMap",
    id: map.id,
    projectId: "project-1",
    title: map.title,
    achievementGoal: map.achievementGoal,
    archivedAt: map.archivedAt,
    createdAt: "2026-01-01 00:00:00",
    updatedAt: "2026-01-01 00:00:00",
  });

  await page.route("**/api/projects/project-1/story-maps**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/projects/project-1/story-maps", "");
    const method = request.method();

    if (path === "" && method === "GET") {
      const all = url.searchParams.get("includeArchived") === "true";
      const visible = maps.filter((map) => all || map.archivedAt === null);
      return route.fulfill(json({ storyMaps: visible.map(toMap), role }));
    }
    if (path === "" && method === "POST") {
      const body = request.postDataJSON() as {
        title: string;
        achievementGoal: string;
        personaNames: string[];
      };
      const map: MapState = {
        id: `map-${maps.length + 1}`,
        title: body.title,
        achievementGoal: body.achievementGoal,
        archivedAt: null,
        personas: body.personaNames.map((name, index) => ({
          id: `persona-${maps.length + 1}-${index}`,
          name,
          position: index,
        })),
      };
      maps.push(map);
      return route.fulfill(json({ storyMap: toMap(map) }, 201));
    }
    const [, mapId, sub] = path.split("/");
    const map = maps.find((item) => item.id === mapId);
    if (!map) return route.fulfill(json({ code: "STORY_MAP_NOT_FOUND" }, 404));
    if (sub === undefined && method === "GET") {
      return route.fulfill(
        json({
          role,
          structure: {
            map: toMap(map),
            personas: map.personas,
            activities: [],
            tasks: [],
            slices: [],
            cards: [],
          },
        }),
      );
    }
    if (sub === "commands" && method === "POST") {
      const { command } = request.postDataJSON() as {
        command: {
          type: string;
          title?: string;
          achievementGoal?: string;
          archived?: boolean;
          name?: string;
          personaId?: string;
        };
      };
      if (command.type === "updateMap") {
        if (command.title !== undefined) map.title = command.title;
        if (command.achievementGoal !== undefined) {
          map.achievementGoal = command.achievementGoal;
        }
        if (command.archived !== undefined) {
          map.archivedAt = command.archived ? "2026-01-02 00:00:00" : null;
        }
      } else if (command.type === "addPersona" && command.name) {
        map.personas.push({
          id: `persona-${map.id}-${map.personas.length}`,
          name: command.name,
          position: map.personas.length,
        });
      } else if (command.type === "removePersona") {
        map.personas = map.personas.filter((p) => p.id !== command.personaId);
      }
      return route.fulfill(json({ seq: 1, result: null, duplicate: false }));
    }
    return route.fulfill(json({ code: "STORY_MAP_NOT_FOUND" }, 404));
  });
  return maps;
}

test("story map: create, edit, archive and restore", async ({ page }) => {
  await mockAuthMe(page);
  await mockStoriesList(page);
  await mockStoryMapApi(page, "owner");

  await page.goto("/projects/project-1/story-maps");
  await expect(page.getByRole("heading", { name: "Story Map" })).toBeVisible();
  await expect(page.getByText("Story Map がありません。")).toBeVisible();

  await page.getByRole("button", { name: "Story Map を作成" }).click();
  await page.getByLabel("タイトル").fill("オンボーディング");
  await page.getByLabel("達成目的").fill("初回 story まで到達する");
  await page.getByLabel("主要ユーザー").fill("オーナー\nメンバー");
  await page.getByRole("button", { name: "作成", exact: true }).click();

  await expect(page).toHaveURL(/\/story-maps\/map-1$/);
  await expect(page.getByLabel("タイトル")).toHaveCount(0);
  await expect(page.getByText("初回 story まで到達する")).toBeVisible();
  await expect(page.getByLabel("主要ユーザー名")).toHaveCount(2);

  await page.getByRole("link", { name: "編集", exact: true }).click();
  await expect(page).toHaveURL(/\/story-maps\/map-1\/edit$/);
  await expect(page.getByLabel("タイトル")).toHaveValue("オンボーディング");
  await page.getByLabel("タイトル").fill("オンボーディング改善");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page).toHaveURL(/\/story-maps\/map-1$/);
  await expect(
    page.getByRole("heading", { name: "オンボーディング改善" }),
  ).toBeVisible();
  await page.getByLabel("主要ユーザーを追加").fill("閲覧者");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByLabel("主要ユーザー名")).toHaveCount(3);

  await page.getByRole("link", { name: "編集", exact: true }).click();
  await page.getByRole("button", { name: "アーカイブ", exact: true }).click();
  await expect(
    page.getByText("このマップはアーカイブ済みです。復元すると編集できます"),
  ).toBeVisible();

  await page.goto("/projects/project-1/story-maps");
  await expect(page.getByText("Story Map がありません。")).toBeVisible();
  await page.getByLabel("アーカイブ済みも表示").check();
  await expect(page.getByText("アーカイブ済み", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "復元" }).click();
  await page.getByLabel("アーカイブ済みも表示").uncheck();
  await expect(
    page.getByRole("link", { name: "オンボーディング改善" }),
  ).toBeVisible();
});

test("story map: viewer sees no edit controls", async ({ page }) => {
  await mockAuthMe(page);
  await mockStoriesList(page);
  const maps = await mockStoryMapApi(page, "viewer");
  maps.push({
    id: "map-1",
    title: "共有マップ",
    achievementGoal: "共有する",
    archivedAt: null,
    personas: [{ id: "persona-1", name: "オーナー", position: 0 }],
  });

  await page.goto("/projects/project-1/story-maps");
  await expect(page.getByRole("link", { name: "共有マップ" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Story Map を作成" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "アーカイブ" })).toHaveCount(0);

  await page.goto("/projects/project-1/story-maps/map-1");
  await expect(page.getByText("閲覧のみできます")).toBeVisible();
  await expect(page.getByRole("link", { name: "編集" })).toHaveCount(0);
  await expect(page.getByLabel("主要ユーザー名")).toHaveCount(0);

  await page.goto("/projects/project-1/story-maps/map-1/edit");
  await expect(page.getByText("閲覧のみできます")).toBeVisible();
  await expect(page.getByRole("button", { name: "保存" })).toHaveCount(0);
});
