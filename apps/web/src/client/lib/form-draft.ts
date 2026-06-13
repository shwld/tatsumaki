const DRAFT_PREFIX = "tatsumaki:draft:";

export function saveDraft(key: string, data: Record<string, unknown>): void {
  try {
    localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(data));
  } catch {
    // Quota exceeded or private browsing — silently ignore.
  }
}

export function loadDraft(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Corrupted data — ignore.
  }
  return null;
}

export function clearDraft(key: string): void {
  localStorage.removeItem(DRAFT_PREFIX + key);
}
