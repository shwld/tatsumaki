import type { BrowserContext, CDPSession, Frame, Page } from "@playwright/test";

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
 *
 * Content is on another site (ADR-0012), so its frame is an out-of-process
 * iframe with its own DevTools target. That target can only be attached after
 * it has committed, so the frame is reloaded once it is attached; the aborted
 * first load is reported as ERR_ABORTED, which is not a refusal.
 */
export async function recordFetchMetadata(
  context: BrowserContext,
  page: Page,
): Promise<{ byFile: () => Map<string, FetchMetadata> }> {
  const urls = new Map<string, string>();
  const extra = new Map<string, Record<string, string>>();
  const record = async (client: CDPSession) => {
    await client.send("Network.enable");
    client.on("Network.requestWillBeSent", (event) => {
      urls.set(event.requestId, event.request.url);
    });
    client.on("Network.requestWillBeSentExtraInfo", (event) => {
      extra.set(event.requestId, event.headers as Record<string, string>);
    });
  };
  await record(await context.newCDPSession(page));

  const attached = new Set<Frame>();
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() || attached.has(frame)) return;
    attached.add(frame);
    context
      .newCDPSession(frame)
      .then(async (client) => {
        await record(client);
        void frame.evaluate(() => location.reload());
      })
      .catch(() => attached.delete(frame));
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
