import type { Page } from "@playwright/test";
import { spaIndexHeaders } from "../../../src/presentation/spa-headers";
import { BASE_URL } from "./server";

/**
 * The page that embeds the artifact, served from the Worker's own origin with
 * the production CSP of the SPA. Its script lives under /assets/ because the
 * real app has no inline script either.
 */
const PARENT_SCRIPT = `
const params = new URLSearchParams(location.search);
const iframe = document.createElement("iframe");
iframe.title = "artifact preview";
iframe.setAttribute("referrerpolicy", "no-referrer");
const sandbox = params.get("sandbox");
if (sandbox !== null) iframe.setAttribute("sandbox", sandbox);
iframe.src = params.get("src");
iframe.id = "artifact-frame";
document.getElementById("slot").append(iframe);

window.__violations = [];
document.addEventListener("securitypolicyviolation", (event) => {
  window.__violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
});

const jitter = { max: 0, samples: 0 };
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  jitter.max = Math.max(jitter.max, now - last - 10);
  jitter.samples += 1;
  last = now;
}, 10);
window.__jitter = jitter;
window.__resetJitter = () => { jitter.max = 0; jitter.samples = 0; last = performance.now(); };
`;

const PARENT_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>parent</title></head>
<body><main id="slot"></main><script src="/assets/parent.js"></script></body></html>`;

const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function canaryAnswer(name: string): {
  contentType: string;
  body: string | Buffer;
} {
  if (name === "image") return { contentType: "image/png", body: PIXEL_PNG };
  if (name === "script" || name === "module.js" || name === "worker.js") {
    return {
      contentType: "text/javascript; charset=utf-8",
      body: "/* canary */",
    };
  }
  if (name === "style")
    return { contentType: "text/css; charset=utf-8", body: "/* canary */" };
  if (name === "frame")
    return {
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><title>canary</title>",
    };
  return { contentType: "text/plain; charset=utf-8", body: "canary" };
}

export const PARENT_PATH = "/__parent";
export const CONTROL_PARENT_PATH = "/__parent-control";

export function parentUrl(options: {
  src: string;
  /** Absent: the iframe has no sandbox attribute at all. */
  sandbox?: string;
  control?: boolean;
}): string {
  const query = new URLSearchParams({ src: options.src });
  if (options.sandbox !== undefined) query.set("sandbox", options.sandbox);
  return `${BASE_URL}${options.control ? CONTROL_PARENT_PATH : PARENT_PATH}?${query}`;
}

/** Installs the parent pages and the canary endpoints on a Playwright page. */
export async function installParentRoutes(page: Page): Promise<{
  canaryHits: () => string[];
}> {
  const hits: string[] = [];

  await page.route(`${BASE_URL}${PARENT_PATH}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      headers: spaIndexHeaders(BASE_URL),
      body: PARENT_HTML,
    }),
  );
  await page.route(`${BASE_URL}${CONTROL_PARENT_PATH}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: PARENT_HTML,
    }),
  );
  await page.route(`${BASE_URL}/assets/parent.js`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: PARENT_SCRIPT,
    }),
  );
  // Anything an artifact manages to reach lands here and is counted. The
  // answer has the right type for what asked, so a probe that gets through
  // really loads and a "blocked" result can only mean it was refused.
  await page.route(/__canary/, (route) => {
    const url = new URL(route.request().url());
    hits.push(`${route.request().method()} ${route.request().url()}`);
    const name = url.pathname.split("/").pop() ?? "";
    const answer = canaryAnswer(name);
    return route.fulfill({
      status: 200,
      contentType: answer.contentType,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: answer.body,
    });
  });

  return { canaryHits: () => [...hits] };
}

export const CANARY_SAME_ORIGIN = `${BASE_URL}/__canary/`;
export const CANARY_EXTERNAL = "http://canary.example.invalid/__canary/";
