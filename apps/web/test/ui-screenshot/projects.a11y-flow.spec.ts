import { expect, test } from "@playwright/test";
import { mockAuthMe } from "./helpers";

test("project create flow uses role/name assertions", async ({ page }) => {
  await mockAuthMe(page);

  let created = false;
  let postedName = "";

  await page.route("**/api/projects", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { name?: string };
      postedName = body.name ?? "";
      created = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          project: {
            id: "01HQZV0M8DG1S2Q3R4T5U6V7WB",
            name: postedName,
            sprintDurationDays: 14,
            createdAt: "2026-01-03T00:00:00.000Z",
            updatedAt: "2026-01-03T00:00:00.000Z",
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projects: created
          ? [
              {
                id: "01HQZV0M8DG1S2Q3R4T5U6V7WB",
                name: postedName,
                sprintDurationDays: 14,
              },
            ]
          : [],
      }),
    });
  });

  await page.goto("/projects/new");

  await expect(
    page.getByRole("heading", { name: "プロジェクトを作成" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "プロジェクト名" })
    .fill("Accessibility-first E2E");
  await page.getByRole("button", { name: "プロジェクトを作成" }).click();

  await expect(page).toHaveURL("/projects");
  await expect(
    page.getByRole("heading", { name: "プロジェクト" }),
  ).toBeVisible();
  await expect(page.getByText("Accessibility-first E2E")).toBeVisible();
  expect(postedName).toBe("Accessibility-first E2E");
});
