import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  BASE_URL,
  contentUrl,
  createProject,
  issuePreviewToken,
  publishSite,
  rawGet,
  readFixtureDirectory,
} from "./support/server";
import {
  CANARY_EXTERNAL,
  CANARY_SAME_ORIGIN,
  installParentRoutes,
  parentUrl,
} from "./support/parent";

const probes = readFixtureDirectory(path.join(__dirname, "fixtures/probes"));
const site = readFixtureDirectory(path.join(__dirname, "fixtures/site"));

type Probe = {
  info: { origin?: string };
  passive: Record<string, { allowed: boolean }>;
};

test.describe("reaching the content route without the preview iframe", () => {
  let projectId: string;
  let probeArtifact: string;
  let siteArtifact: string;

  test.beforeAll(async () => {
    projectId = await createProject("sandbox direct access");
    probeArtifact = (await publishSite(projectId, probes, { title: "probes" }))
      .artifactId;
    siteArtifact = (await publishSite(projectId, site, { title: "site" }))
      .artifactId;
  });

  test("a content URL opened as a page of its own is still sandboxed by its headers", async ({
    page,
  }) => {
    // ADR-0010 §2: the `Content-Security-Policy: sandbox` response header alone
    // must keep the document away from the app, with no iframe attribute.
    await installParentRoutes(page);
    const token = await issuePreviewToken(projectId, probeArtifact, 1);
    await page.goto(contentUrl(token.token, "index.html"));

    expect(await page.evaluate(() => window.origin)).toBe("null");
    const result = (await page.evaluate(
      ([canary, external]) =>
        (
          window as unknown as {
            __runPassive: (a: string, b: string) => Promise<unknown>;
          }
        ).__runPassive(canary as string, external as string),
      [CANARY_SAME_ORIGIN, CANARY_EXTERNAL],
    )) as Probe;

    expect(result.info.origin).toBe("null");
    for (const name of [
      "cookieRead",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "fetchSameOrigin",
      "xhr",
    ]) {
      expect(result.passive[name]?.allowed, name).toBe(false);
    }
    // No API call is possible with the user's session.
    const apiCall = await page.evaluate(() =>
      fetch("/api/health").then(
        () => "reached",
        () => "refused",
      ),
    );
    expect(apiCall).toBe("refused");
  });

  test("a token that is missing, forged or altered is answered with the same 404", async ({
    page,
  }) => {
    const token = await issuePreviewToken(projectId, siteArtifact, 1);
    const flipped = `${token.token.slice(0, -1)}${token.token.endsWith("A") ? "B" : "A"}`;
    const asDocument = { "Sec-Fetch-Dest": "document" };
    const denied = [
      `${BASE_URL}/artifact-content/`,
      `${BASE_URL}/artifact-content/not-a-token/index.html`,
      contentUrl(flipped, "index.html"),
      contentUrl(token.token, "missing.html"),
      `${BASE_URL}/artifact-content/${token.token}`,
    ];

    const bodies = new Set<string>();
    for (const url of denied) {
      const response = await page.request.get(url, {
        headers: asDocument,
        maxRedirects: 0,
      });
      expect(response.status(), url).toBe(404);
      bodies.add(await response.text());
      expect(response.headers()["content-security-policy"], url).toContain(
        "sandbox allow-scripts",
      );
      expect(response.headers()["cache-control"], url).toContain("no-store");
    }
    expect(bodies.size, "every refusal looks identical").toBe(1);

    // A valid token on a request that is neither a navigation nor a CORS
    // subresource of the sandboxed document.
    expect(
      (await page.request.get(contentUrl(token.token, "index.html"))).status(),
    ).toBe(404);
    expect(
      (
        await page.request.get(contentUrl(token.token, "index.html"), {
          headers: asDocument,
        })
      ).status(),
    ).toBe(200);
  });

  test("a path that tries to leave the version is refused, as sent on the wire", async () => {
    const token = await issuePreviewToken(projectId, siteArtifact, 1);
    const base = `/artifact-content/${token.token}`;
    const asDocument = { "Sec-Fetch-Dest": "document" };
    const index = await rawGet(`${base}/index.html`, asDocument);
    expect(index.status).toBe(200);

    // These escape the token directory or use encodings a canonicalizer must
    // not accept; none may ever answer with a file.
    for (const raw of [
      `${base}/../index.html`,
      `${base}/%2e%2e/index.html`,
      `${base}/..%2findex.html`,
      `${base}/%2e%2e%2findex.html`,
      `${base}/.%2e/index.html`,
      `${base}/./index.html`,
      `${base}//index.html`,
      `${base}/index.html%00`,
      `${base}/%00index.html`,
      `${base}/assets%5c..%5cindex.html`,
      `${base}/assets/..%2fclassic.js`,
    ]) {
      const response = await rawGet(raw, asDocument);
      // A dot segment inside the path may be resolved by the server's HTTP
      // layer into a valid request for index.html itself; that serves the
      // same version's file and nothing else.
      const servesOnlyTheVersionsOwnFile =
        response.status === 200 && response.body === index.body;
      expect(
        response.status === 404 || servesOnlyTheVersionsOwnFile,
        `${raw} -> ${response.status}`,
      ).toBe(true);
    }
    // The ones that cannot be normalized into the version must be 404.
    for (const raw of [
      `${base}/%2e%2e%2findex.html`,
      `${base}/..%2findex.html`,
      `${base}/index.html%00`,
      `${base}/%00index.html`,
    ]) {
      expect((await rawGet(raw, asDocument)).status, raw).toBe(404);
    }
  });

  test("the app itself cannot load an artifact file as a script, a fetch or an image", async ({
    page,
  }) => {
    await installParentRoutes(page);
    const token = await issuePreviewToken(projectId, siteArtifact, 1);
    const scriptUrl = contentUrl(token.token, "classic.js");

    // The app's own CSP (production headers) refuses the script outright ...
    await page.goto(
      parentUrl({
        src: contentUrl(token.token, "index.html"),
        sandbox: "allow-scripts",
      }),
    );
    await page.evaluate((url) => {
      const script = document.createElement("script");
      script.src = url;
      document.head.appendChild(script);
    }, scriptUrl);
    await page.waitForTimeout(300);
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
          v.directive === "script-src-elem" &&
          v.blocked.includes("/artifact-content/"),
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __classicLoaded?: boolean }).__classicLoaded,
      ),
    ).toBeUndefined();

    // ... and even without that CSP the route itself answers 404, because a
    // same-origin script request is not what an artifact's iframe sends.
    await page.goto(
      parentUrl({
        src: contentUrl(token.token, "index.html"),
        sandbox: "allow-scripts",
        control: true,
      }),
    );
    const outcomes = await page.evaluate(async (url) => {
      const script = await new Promise<string>((resolve) => {
        const element = document.createElement("script");
        element.src = url;
        element.onload = () => resolve("loaded");
        element.onerror = () => resolve("refused");
        document.head.appendChild(element);
      });
      const image = await new Promise<string>((resolve) => {
        const element = new Image();
        element.onload = () => resolve("loaded");
        element.onerror = () => resolve("refused");
        element.src = url.replace("classic.js", "pixel.png");
      });
      const fetched = await fetch(url).then(
        (response) => String(response.status),
        () => "refused",
      );
      return { script, image, fetched };
    }, scriptUrl);

    expect(outcomes).toEqual({
      script: "refused",
      image: "refused",
      fetched: "404",
    });
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __classicLoaded?: boolean }).__classicLoaded,
      ),
    ).toBeUndefined();
  });
});
