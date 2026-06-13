/**
 * List context preservation utilities.
 *
 * ## Responsibility boundary with #78
 *
 * This module handles **list context** — the transient view-state of the story
 * list screen (filter chips, unestimated toggle, scroll position). It is
 * encoded as URL query params (`status`, `point`) and a sessionStorage scroll
 * key, so that navigating away from the list and returning restores the
 * previous view.
 *
 * Issue #78 (search / advanced filtering) covers **search queries and
 * structured filter conditions**. When #78 is implemented, its state should be
 * merged into the URL query namespace (e.g. `q`, `label`, `type`) and this
 * module updated to forward those params as well. Until then, the two
 * responsibilities are cleanly separated: list-context preserves *view state*;
 * #78 will own *search state*.
 */

const SCROLL_KEY_PREFIX = "tatsumaki:scroll:";

/**
 * Build a destination path that carries the current list search params so the
 * destination screen can navigate back with context intact.
 *
 * Encodes the list's current `URLSearchParams` as a single `_list` param.
 */
export function buildPathWithListContext(
  basePath: string,
  listSearchParams: URLSearchParams,
): string {
  const listQuery = listSearchParams.toString();
  if (!listQuery) return basePath;
  const sep = basePath.includes("?") ? "&" : "?";
  return `${basePath}${sep}_list=${encodeURIComponent(listQuery)}`;
}

/**
 * Extract the preserved list search string from the current URL's `_list`
 * param. Returns the raw query string (without leading `?`) or `""`.
 */
export function extractListContext(searchParams: URLSearchParams): string {
  return searchParams.get("_list") ?? "";
}

/**
 * Build the "back to list" path using the preserved list context.
 */
export function buildReturnPath(
  listBasePath: string,
  listContext: string,
): string {
  if (!listContext) return listBasePath;
  return `${listBasePath}?${listContext}`;
}

/**
 * Save scroll position for a given route key.
 */
export function saveScrollPosition(routeKey: string): void {
  try {
    sessionStorage.setItem(
      `${SCROLL_KEY_PREFIX}${routeKey}`,
      String(window.scrollY),
    );
  } catch {
    // Quota exceeded — silently ignore.
  }
}

/**
 * Restore scroll position for a given route key. Returns `true` if a position
 * was restored.
 */
export function restoreScrollPosition(routeKey: string): boolean {
  try {
    const raw = sessionStorage.getItem(`${SCROLL_KEY_PREFIX}${routeKey}`);
    if (raw === null) return false;
    const y = Number(raw);
    if (Number.isFinite(y)) {
      window.scrollTo(0, y);
      return true;
    }
  } catch {
    // Ignore.
  }
  return false;
}
