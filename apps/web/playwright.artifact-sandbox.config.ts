import { defineConfig, devices } from "@playwright/test";

const PORT = 8788;
const STATE = "test-results/artifact-sandbox-state";
// Any 32+ character value works: it only signs tokens for this throwaway server.
const SIGNING_KEY = "artifact-sandbox-signing-key-0123456789";

/**
 * Real-browser checks of the artifact sandbox. Unlike the screenshot suite
 * (a Vite preview with mocked APIs), this talks to the actual Worker, because
 * CSP, Fetch Metadata and CORS depend on the headers it really sends.
 */
export default defineConfig({
  testDir: "./test/artifact-sandbox",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["github"],
        [
          "html",
          { open: "never", outputFolder: "playwright-report-artifact-sandbox" },
        ],
      ]
    : "list",
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices["Desktop Chrome"],
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure",
  },
  webServer: {
    command: [
      "(test -d dist/client || bun --bun vite build)",
      `bun -e "require('node:fs').rmSync('${STATE}', { recursive: true, force: true })"`,
      `bunx wrangler d1 migrations apply DB --local -c wrangler.dev.toml --persist-to ${STATE}`,
      `bunx wrangler d1 execute DB --local -c wrangler.dev.toml --persist-to ${STATE} --command "INSERT INTO users (id, display_name, email, access_status) VALUES ('dev|local', 'dev', 'dev@localhost', 'allowed')"`,
      `bunx wrangler dev -c wrangler.dev.toml --ip 127.0.0.1 --port ${PORT} --persist-to ${STATE} --var ARTIFACT_CONTENT_SIGNING_KEY:${SIGNING_KEY}`,
    ].join(" && "),
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
