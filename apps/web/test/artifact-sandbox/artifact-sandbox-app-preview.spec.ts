import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  BASE_URL,
  createProject,
  publishSite,
  readFixtureDirectory,
} from "./support/server";

const siteFiles = readFixtureDirectory(path.join(__dirname, "fixtures/site"));

test.describe("the real app's artifact preview", () => {
  let projectId: string;
  let artifactId: string;

  test.beforeAll(async () => {
    projectId = await createProject("app preview");
    artifactId = (
      await publishSite(projectId, siteFiles, { title: "app preview probe" })
    ).artifactId;
  });

  test("renders a published site in a frame that has no way back into the app", async ({
    page,
  }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") violations.push(message.text());
    });

    await page.goto(
      `${BASE_URL}/projects/${projectId}/artifacts/${artifactId}`,
    );

    const iframe = page.locator("iframe");
    await expect(iframe).toHaveCount(1);
    await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
    await expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(iframe).toHaveAttribute("allow", "");

    const root = page.frameLocator("iframe").locator("html");
    await expect(root).toHaveAttribute("data-classic", "yes");
    await expect(root).toHaveAttribute("data-module", "helper-ok");
    await expect(root).toHaveAttribute("data-styled", "rgb(1, 2, 3)");

    await expect(root.evaluate(() => window.origin)).resolves.toBe("null");
    await expect(
      page.evaluate(() => {
        const frame = document.querySelector("iframe");
        try {
          return frame?.contentDocument === null ? "blocked" : "readable";
        } catch {
          return "blocked";
        }
      }),
    ).resolves.toBe("blocked");

    expect(violations.filter((text) => /Refused|CORS/i.test(text))).toEqual([]);
  });

  test("an unknown version is shown as not found without a frame", async ({
    page,
  }) => {
    await page.goto(
      `${BASE_URL}/projects/${projectId}/artifacts/${artifactId}/versions/9`,
    );

    await expect(page.getByText(/Artifact が見つかりません/)).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
  });
});
