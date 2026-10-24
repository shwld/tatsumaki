import type { BrowserContext, Page } from "@playwright/test";

export type FetchMetadata = {
  dest?: string;
  site?: string;
  mode?: string;
  origin?: string;
};

/**
 * The browser adds Sec-Fetch-* itself, so neither Playwright's request API nor
 * the page can see them. The DevTools protocol reports them in
 * Network.requestWillBeSentExtraInfo, which is what the server receives.
 */
export async function recordFetchMetadata(
  context: BrowserContext,
  page: Page,
): Promise<{ byFile: () => Map<string, FetchMetadata> }> {
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  const urls = new Map<string, string>();
  const extra = new Map<string, Record<string, string>>();
  client.on("Network.requestWillBeSent", (event) => {
    urls.set(event.requestId, event.request.url);
  });
  client.on("Network.requestWillBeSentExtraInfo", (event) => {
    extra.set(event.requestId, event.headers as Record<string, string>);
  });

  return {
    byFile: () => {
      const result = new Map<string, FetchMetadata>();
      for (const [requestId, url] of urls) {
        const { pathname } = new URL(url);
        if (!pathname.startsWith("/artifact-content/")) continue;
        const headers = extra.get(requestId);
        if (!headers) continue;
        const get = (name: string) =>
          headers[name] ?? headers[name.toLowerCase()];
        result.set(pathname.split("/").slice(3).join("/"), {
          dest: get("Sec-Fetch-Dest"),
          site: get("Sec-Fetch-Site"),
          mode: get("Sec-Fetch-Mode"),
          origin: get("Origin"),
        });
      }
      return result;
    },
  };
}
