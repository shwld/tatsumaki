import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createProject,
  issuePreviewToken,
  publishSite,
  readFixtureDirectory,
} from "./support/server";
import { installParentRoutes, parentUrl } from "./support/parent";

/**
 * ADR-0012: the artifact is served from another site, so a busy loop in it
 * must not freeze the page that embeds it. ADR-0010 measured a ~3s freeze
 * when both were the same site.
 */
const BUSY_LOOP_MS = 3000;
const MAX_PARENT_DELAY_MS = 1000;

test("an artifact busy loop does not freeze the embedding page", async ({
  page,
}, testInfo) => {
  const projectId = await createProject("sandbox main thread");
  const files = readFixtureDirectory(
    path.join(__dirname, "fixtures/probes"),
  ).filter((file) => file.path === "block.html");
  const { artifactId } = await publishSite(projectId, files, {
    title: "busy loop",
    entrypoint: "block.html",
  });
  await installParentRoutes(page);
  const token = await issuePreviewToken(projectId, artifactId, 1);
  await page.goto(
    parentUrl({ src: token.contentUrl, sandbox: "allow-scripts" }),
  );
  const frame = page
    .frames()
    .find((candidate) => candidate !== page.mainFrame());
  if (!frame) throw new Error("the artifact iframe is missing");
  await frame.waitForFunction(
    () =>
      typeof (window as unknown as { __spin?: unknown }).__spin === "function",
  );

  const maxDelay = () =>
    page.evaluate(
      () =>
        (window as unknown as { __jitter: { max: number; samples: number } })
          .__jitter,
    );

  await page.evaluate(() =>
    (window as unknown as { __resetJitter: () => void }).__resetJitter(),
  );
  await page.waitForTimeout(1000);
  const idle = await maxDelay();

  await page.evaluate(() =>
    (window as unknown as { __resetJitter: () => void }).__resetJitter(),
  );
  // Start the loop from inside the artifact without waiting for it.
  await frame.evaluate(() => {
    setTimeout(
      () =>
        (window as unknown as { __spin: (ms: number) => void }).__spin(3000),
      0,
    );
  });
  await page.waitForTimeout(3600);
  const spinning = await maxDelay();

  const report = {
    browser: testInfo.project.name,
    headless: true,
    busyLoopMs: BUSY_LOOP_MS,
    embeddingPageMaxTimerDelayMs: {
      idle: Math.round(idle.max),
      withBusyLoop: Math.round(spinning.max),
    },
  };
  console.log(`main thread measurement: ${JSON.stringify(report)}`);
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/artifact-sandbox-main-thread.json",
    JSON.stringify(report, null, 2),
  );
  testInfo.annotations.push({
    type: "main-thread",
    description: JSON.stringify(report),
  });

  expect(idle.samples).toBeGreaterThan(10);
  expect(idle.max).toBeLessThan(500);
  // The loop ran for 3s; a frozen parent would report about that delay.
  expect(spinning.samples).toBeGreaterThan(10);
  expect(spinning.max).toBeLessThan(MAX_PARENT_DELAY_MS);
});
