import {
  expect,
  test,
  type BrowserContext,
  type Frame,
  type Page,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BASE_URL,
  createProject,
  issuePreviewToken,
  publishSite,
  readFixtureDirectory,
} from "./support/server";
import {
  CANARY_EXTERNAL,
  CANARY_SAME_ORIGIN,
  installParentRoutes,
  parentUrl,
} from "./support/parent";

const probesDirectory = path.join(__dirname, "fixtures/probes");

type Outcome = { allowed: boolean; value?: string; error?: string };
type ProbeResult = {
  info: { origin?: string };
  passive: Record<string, Outcome>;
  gesture: Record<string, Outcome>;
  violations: Array<{ directive: string; blocked: string }>;
};

const PASSIVE = [
  "parentDocument",
  "parentLocation",
  "topLocation",
  "cookieRead",
  "cookieWrite",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "serviceWorker",
  "fetchSameOrigin",
  "fetchExternal",
  "xhr",
  "webSocket",
  "eventSource",
  "sendBeacon",
  "worker",
  "dynamicImport",
  "imageSameOrigin",
  "imageExternal",
  "scriptSameOrigin",
  "stylesheetExternal",
  "nestedFrame",
];

/**
 * Not judged by the return value: a blocked sendBeacon still returns true
 * (queued) and a blocked iframe still fires its load event (the error page
 * loads). They are judged by the CSP violation / the error page and by
 * nothing reaching the network.
 */
const REFUSED_ONLY_BY_VIOLATION = ["sendBeacon", "nestedFrame"];

/** Where each network probe must have been refused: the CSP layer. */
const REFUSED_BY_CSP: Array<
  [probe: string, urlPart: string, directive: string]
> = [
  ["fetchSameOrigin", "/__canary/fetch", "connect-src"],
  ["fetchExternal", "/__canary/fetch", "connect-src"],
  ["xhr", "/__canary/xhr", "connect-src"],
  ["webSocket", "/__canary/socket", "connect-src"],
  ["eventSource", "/__canary/events", "connect-src"],
  ["sendBeacon", "/__canary/beacon", "connect-src"],
  ["dynamicImport", "/__canary/module.js", "script-src-elem"],
  ["imageSameOrigin", "/__canary/image", "img-src"],
  ["imageExternal", "/__canary/image", "img-src"],
  ["scriptSameOrigin", "/__canary/script", "script-src-elem"],
  ["stylesheetExternal", "/__canary/style", "style-src-elem"],
];

function sandboxedFrame(page: Page): Frame {
  const frame = page
    .frames()
    .find((candidate) => candidate !== page.mainFrame());
  if (!frame) throw new Error("the artifact iframe is missing");
  return frame;
}

async function waitForProbe(page: Page): Promise<Frame> {
  await page.waitForFunction(() => document.querySelector("iframe") !== null);
  const frame = sandboxedFrame(page);
  await frame.waitForFunction(
    () =>
      typeof (window as unknown as { __runPassive?: unknown }).__runPassive ===
      "function",
  );
  return frame;
}

/**
 * Serves the very same probe files without any isolation: same origin as the
 * app, no CSP, no sandbox attribute. If the probes can only "fail", this is
 * where that would show.
 */
async function serveUnisolatedProbe(page: Page) {
  await page.route(`${BASE_URL}/__control/probes/**`, (route) => {
    const file = new URL(route.request().url()).pathname.replace(
      "/__control/probes/",
      "",
    );
    const contentType = file.endsWith(".js") ? "text/javascript" : "text/html";
    return route.fulfill({
      status: 200,
      contentType: `${contentType}; charset=utf-8`,
      body: readFileSync(path.join(probesDirectory, file)),
    });
  });
}

type Observations = {
  popups: number;
  downloads: number;
  dialogs: number;
  mainUrlChanges: string[];
};

function observe(page: Page): Observations {
  const observations: Observations = {
    popups: 0,
    downloads: 0,
    dialogs: 0,
    mainUrlChanges: [],
  };
  page.on("popup", () => (observations.popups += 1));
  page.on("download", () => (observations.downloads += 1));
  page.on("dialog", (dialog) => {
    observations.dialogs += 1;
    void dialog.dismiss();
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame())
      observations.mainUrlChanges.push(frame.url());
  });
  return observations;
}

async function openFreshProbe(
  page: Page,
  projectId: string,
  artifactId: string,
): Promise<Frame> {
  const token = await issuePreviewToken(projectId, artifactId, 1);
  await page.goto(
    parentUrl({ src: token.contentPath, sandbox: "allow-scripts" }),
  );
  await page.waitForFunction(() => document.querySelector("iframe") !== null);
  const frame = sandboxedFrame(page);
  await frame.waitForFunction(
    () =>
      typeof (window as unknown as { __prepareNative?: unknown })
        .__prepareNative === "function",
  );
  await frame.evaluate(
    (canary) =>
      (
        window as unknown as { __prepareNative: (c: string) => void }
      ).__prepareNative(canary),
    CANARY_SAME_ORIGIN,
  );
  return frame;
}

async function runGestures(page: Page, frame: Frame, context: BrowserContext) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: BASE_URL,
  });
  await frame.evaluate(
    (canary) =>
      (
        window as unknown as { __prepareNative: (c: string) => void }
      ).__prepareNative(canary),
    CANARY_SAME_ORIGIN,
  );
  // Real clicks inside the frame, so user activation is genuine. Top
  // navigation goes last: without isolation it replaces the whole page.
  for (const id of [
    "open-popup",
    "link-blank",
    "download",
    "clipboard",
    "fullscreen",
    "eval",
    "modal",
    "top-nav",
  ]) {
    const started = Date.now();
    await frame
      .locator(`#${id}`)
      .click({ timeout: 4000 })
      .catch((error: Error) => {
        if (process.env.ARTIFACT_SANDBOX_DEBUG)
          console.log(`click #${id}: ${error.message.split("\n")[0]}`);
      });
    if (process.env.ARTIFACT_SANDBOX_DEBUG)
      console.log(
        `#${id} took ${Date.now() - started}ms; frame is now ${frame.url().slice(0, 80)}; popups so far: ${page.context().pages().length - 1}`,
      );
    await page.waitForTimeout(150);
  }
}

test.describe("artifact isolation in a real browser", () => {
  let projectId: string;
  let artifactId: string;

  test.beforeAll(async () => {
    projectId = await createProject("sandbox isolation");
    ({ artifactId } = await publishSite(
      projectId,
      readFixtureDirectory(probesDirectory),
      {
        title: "isolation probe",
      },
    ));
  });

  test("the sandboxed artifact is refused everything it should be", async ({
    page,
    context,
  }) => {
    const { canaryHits } = await installParentRoutes(page);
    await context.addCookies([
      { name: "parent_session", value: "secret", url: BASE_URL },
    ]);
    const observations = observe(page);

    const token = await issuePreviewToken(projectId, artifactId, 1);
    await page.goto(
      parentUrl({ src: token.contentPath, sandbox: "allow-scripts" }),
    );
    const frame = await waitForProbe(page);
    const parentUrlBefore = page.url();

    const result = (await frame.evaluate(
      ([canary, external]) =>
        (
          window as unknown as {
            __runPassive: (a: string, b: string) => Promise<unknown>;
          }
        ).__runPassive(canary as string, external as string),
      [CANARY_SAME_ORIGIN, CANARY_EXTERNAL],
    )) as ProbeResult;

    // An opaque origin: the document is not tatsumaki's origin. (window.origin
    // is the security origin; location.origin would still show the URL's.)
    expect(result.info.origin).toBe("null");

    expect(
      PASSIVE.filter((name) => result.passive[name] === undefined),
      "every probe ran",
    ).toEqual([]);
    const permitted = PASSIVE.filter(
      (name) =>
        !REFUSED_ONLY_BY_VIOLATION.includes(name) &&
        result.passive[name]?.allowed !== false,
    );
    expect(
      permitted.map(
        (name) => `${name}: ${JSON.stringify(result.passive[name])}`,
      ),
      "probes that were NOT refused",
    ).toEqual([]);

    // "Refused" must mean refused by the intended layer, not just an exception.
    for (const [probe, urlPart, directive] of REFUSED_BY_CSP) {
      expect(
        result.violations.some(
          (v) => v.directive === directive && v.blocked.includes(urlPart),
        ),
        `${probe}: a ${directive} violation for ${urlPart}\n${JSON.stringify(result.violations)}`,
      ).toBe(true);
    }

    // A worker needs a same-origin script, which an opaque origin cannot have;
    // that check fires before the CSP's worker-src ever matters.
    expect(result.passive.worker?.error).toContain("origin 'null'");
    // A nested frame is replaced by the browser's error page: the frame-src
    // violation is reported to the browser, not to the embedding document.
    expect(
      page
        .frames()
        .some((candidate) => candidate.url().startsWith("chrome-error://")),
      "the nested frame was blocked",
    ).toBe(true);

    // Nothing reached the network.
    expect(canaryHits()).toEqual([]);

    // Each gesture runs in a freshly loaded preview: a refused navigation
    // replaces the frame with the browser's error page, which ends the
    // artifact's document.
    const gestureResults: Record<string, Outcome | undefined> = {};
    const gestureViolations: Array<{ directive: string; blocked: string }> = [];
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: BASE_URL,
    });
    for (const [id, name] of [
      ["open-popup", "windowOpen"],
      ["clipboard", "clipboardWrite"],
      ["fullscreen", "fullscreen"],
      ["eval", "eval"],
      ["top-nav", "topNavigation"],
      ["link-blank", undefined],
      ["download", undefined],
      ["form-submit", undefined],
      ["modal", undefined],
    ] as const) {
      const fresh = await openFreshProbe(page, projectId, artifactId);
      await fresh
        .locator(`#${id}`)
        .click({ timeout: 4000 })
        .catch(() => undefined);
      await page.waitForTimeout(250);
      const after = (await fresh
        .evaluate(
          () => (window as unknown as { __result: ProbeResult }).__result,
        )
        .catch(() => undefined)) as ProbeResult | undefined;
      if (name) gestureResults[name] = after?.gesture[name];
      if (after) gestureViolations.push(...after.violations);
    }

    for (const name of [
      "windowOpen",
      "clipboardWrite",
      "fullscreen",
      "eval",
      "topNavigation",
    ]) {
      expect(
        gestureResults[name]?.allowed,
        `${name}: ${JSON.stringify(gestureResults[name])}`,
      ).toBe(false);
    }
    expect(
      gestureViolations.some(
        (v) => v.directive === "script-src" && v.blocked === "eval",
      ),
      "eval was refused by the CSP",
    ).toBe(true);
    // A form submit never gets as far as the CSP's form-action: the sandbox
    // (no allow-forms) refuses it first, so the frame neither navigates nor
    // reports a violation.

    expect(observations.popups, "no popup or new tab").toBe(0);
    expect(observations.downloads, "no download").toBe(0);
    expect(observations.dialogs, "no alert/confirm/prompt").toBe(0);
    expect(canaryHits(), "no click reached the network").toEqual([]);
    expect(
      observations.mainUrlChanges.filter((url) => !url.includes("/__parent")),
      "the embedding page was never navigated",
    ).toEqual([]);
  });

  test("the same probes succeed without isolation, so the refusals are meaningful", async ({
    page,
    context,
  }) => {
    const { canaryHits } = await installParentRoutes(page);
    await serveUnisolatedProbe(page);
    await context.addCookies([
      { name: "parent_session", value: "secret", url: BASE_URL },
    ]);
    const observations = observe(page);

    await page.goto(
      parentUrl({
        src: `${BASE_URL}/__control/probes/index.html`,
        control: true,
      }),
    );
    const frame = await waitForProbe(page);

    const result = (await frame.evaluate(
      ([canary, external]) =>
        (
          window as unknown as {
            __runPassive: (a: string, b: string) => Promise<unknown>;
          }
        ).__runPassive(canary as string, external as string),
      [CANARY_SAME_ORIGIN, CANARY_EXTERNAL],
    )) as ProbeResult;

    expect(result.info.origin).toBe(BASE_URL);
    for (const name of [
      "parentDocument",
      "parentLocation",
      "cookieRead",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "fetchSameOrigin",
      "xhr",
      "imageSameOrigin",
      "scriptSameOrigin",
      "nestedFrame",
    ]) {
      expect(
        result.passive[name]?.allowed,
        `${name} should work without isolation: ${JSON.stringify(result.passive[name])}`,
      ).toBe(true);
    }
    expect(result.passive.cookieRead?.value).toContain("parent_session");
    expect(canaryHits().length).toBeGreaterThan(0);

    await runGestures(page, frame, context);
    expect(
      observations.popups,
      "a popup opens without isolation",
    ).toBeGreaterThan(0);
    expect(
      observations.downloads,
      "a download starts without isolation",
    ).toBeGreaterThan(0);
    expect(
      observations.dialogs,
      "a dialog opens without isolation",
    ).toBeGreaterThan(0);
  });

  test("the artifact cannot send its own frame to another site", async ({
    page,
  }) => {
    const { canaryHits } = await installParentRoutes(page);
    const token = await issuePreviewToken(projectId, artifactId, 1);
    await page.goto(
      parentUrl({ src: token.contentPath, sandbox: "allow-scripts" }),
    );
    const frame = await waitForProbe(page);
    await frame.evaluate(
      (canary) =>
        (
          window as unknown as { __prepareNative: (c: string) => void }
        ).__prepareNative(canary),
      CANARY_SAME_ORIGIN,
    );

    await frame.locator("#self-nav").click();
    await frame.waitForTimeout(400);

    // Without the embedding page's `frame-src`, ADR-0010 accepted this: an
    // artifact could navigate its own iframe anywhere (a phishing page). The
    // SPA's CSP now refuses every navigation outside /artifact-content/.
    expect(canaryHits()).toEqual([]);
    // The browser replaces the blocked frame with its error page.
    expect(frame.url()).toBe("chrome-error://chromewebdata/");
    const violations = await page.evaluate(
      () =>
        (
          window as unknown as {
            __violations: Array<{ directive: string; blocked: string }>;
          }
        ).__violations,
    );
    expect(
      violations.some(
        (v) =>
          v.directive === "frame-src" &&
          v.blocked.includes("/__canary/own-navigation"),
      ),
    ).toBe(true);
  });

  test("a multi-page artifact can still link to its own pages", async ({
    page,
  }) => {
    await installParentRoutes(page);
    const token = await issuePreviewToken(projectId, artifactId, 1);
    await page.goto(
      parentUrl({ src: token.contentPath, sandbox: "allow-scripts" }),
    );
    await waitForProbe(page);

    await page.frameLocator("#artifact-frame").locator("#inner-link").click();

    await expect(
      page.frameLocator("#artifact-frame").locator("#inner"),
    ).toHaveText("second page of the same artifact");
  });
});
