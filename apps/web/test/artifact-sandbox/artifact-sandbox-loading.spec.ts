import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  BASE_URL,
  createProject,
  issuePreviewToken,
  publishSite,
  readFixtureDirectory,
} from "./support/server";
import { recordFetchMetadata } from "./support/fetch-metadata";
import { installParentRoutes, parentUrl } from "./support/parent";

const siteFiles = readFixtureDirectory(path.join(__dirname, "fixtures/site"));

test.describe("a published site in the sandboxed preview", () => {
  let projectId: string;
  let artifactId: string;

  test.beforeAll(async () => {
    projectId = await createProject("sandbox loading");
    const first = await publishSite(projectId, siteFiles, {
      title: "loading probe",
    });
    artifactId = first.artifactId;
  });

  test("loads html, css, classic and module scripts, an image and a font", async ({
    page,
    context,
  }) => {
    await installParentRoutes(page);
    const metadata = await recordFetchMetadata(context, page);
    const failed: string[] = [];
    const consoleErrors: string[] = [];
    page.on("requestfailed", (request) => failed.push(request.url()));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    const token = await issuePreviewToken(projectId, artifactId, 1);
    await page.goto(
      parentUrl({ src: token.contentPath, sandbox: "allow-scripts" }),
    );

    const frame = page.frameLocator("#artifact-frame");
    const root = frame.locator("html");
    await expect(root).toHaveAttribute("data-classic", "yes");
    await expect(root).toHaveAttribute("data-module", "helper-ok");
    await expect(root).toHaveAttribute("data-image", "1");
    await expect(root).toHaveAttribute("data-styled", "rgb(1, 2, 3)");
    await expect(root).toHaveAttribute("data-font-requested", "done");

    expect(failed).toEqual([]);
    expect(
      consoleErrors.filter((text) => /Refused|CORS|blocked/i.test(text)),
    ).toEqual([]);

    // What the content route receives for each kind of request. This is the
    // evidence for the Fetch Metadata rule in ADR-0010: the sandboxed document
    // is an opaque origin, so its subresources are cross-site while the
    // iframe navigation itself comes from the (same-origin) embedding page.
    const observed = metadata.byFile();
    expect(observed.get("index.html")).toMatchObject({
      dest: "iframe",
      site: "same-origin",
    });
    for (const [file, dest, mode] of [
      ["classic.js", "script", "no-cors"],
      ["style.css", "style", "no-cors"],
      ["pixel.png", "image", "no-cors"],
      ["probe.woff2", "font", "cors"],
      ["module.js", "script", "cors"],
      ["helper.js", "script", "cors"],
    ] as const) {
      expect(observed.get(file), file).toMatchObject({
        dest,
        site: "cross-site",
        mode,
      });
    }
    // Module scripts and fonts are fetched with CORS from the opaque origin.
    expect(observed.get("module.js")?.origin).toBe("null");
    expect(observed.get("probe.woff2")?.origin).toBe("null");
  });

  test("answers every content request with the sandbox headers", async ({
    page,
  }) => {
    await installParentRoutes(page);
    const responses: Array<{
      url: string;
      headers: Record<string, string>;
      status: number;
    }> = [];
    page.on("response", async (response) => {
      if (response.url().includes("/artifact-content/")) {
        responses.push({
          url: response.url(),
          headers: await response.allHeaders(),
          status: response.status(),
        });
      }
    });
    const token = await issuePreviewToken(projectId, artifactId, 1);
    await page.goto(
      parentUrl({ src: token.contentPath, sandbox: "allow-scripts" }),
    );
    await expect(
      page.frameLocator("#artifact-frame").locator("html"),
    ).toHaveAttribute("data-module", "helper-ok");

    expect(responses.length).toBeGreaterThanOrEqual(7);
    for (const response of responses) {
      expect(response.status, response.url).toBe(200);
      const csp = response.headers["content-security-policy"] ?? "";
      expect(csp).toContain("sandbox allow-scripts");
      expect(csp).toContain("connect-src 'none'");
      expect(csp).toContain("form-action 'none'");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
      expect(response.headers["cache-control"]).toContain("no-store");
    }
  });

  test("keeps a past version unchanged after a newer one is published", async ({
    page,
  }) => {
    await installParentRoutes(page);
    const changed = siteFiles.map((file) =>
      file.path === "index.html"
        ? {
            ...file,
            body: Buffer.from(
              file.body.toString().replace("version one", "version two"),
            ),
          }
        : file,
    );
    const second = await publishSite(projectId, changed, {
      artifactId,
      baseVersion: 1,
    });
    expect(second.version).toBe(2);

    const v1 = await issuePreviewToken(projectId, artifactId, 1);
    await page.goto(
      parentUrl({ src: v1.contentPath, sandbox: "allow-scripts" }),
    );
    await expect(
      page.frameLocator("#artifact-frame").locator("#styled"),
    ).toHaveText("version one");

    const v2 = await issuePreviewToken(projectId, artifactId, 2);
    await page.goto(
      parentUrl({ src: v2.contentPath, sandbox: "allow-scripts" }),
    );
    await expect(
      page.frameLocator("#artifact-frame").locator("#styled"),
    ).toHaveText("version two");

    expect(BASE_URL).toContain("127.0.0.1");
  });
});
