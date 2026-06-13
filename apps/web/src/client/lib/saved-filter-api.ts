import type { SavedFilter } from "../types/saved-filter";
import type { StorySearchFilters } from "../components/story-search-bar";
import {
  projectSavedFiltersApiPath,
  projectSavedFilterApiPath,
} from "./story-routes";

export async function fetchSavedFilters(
  projectId: string,
): Promise<SavedFilter[]> {
  const res = await fetch(projectSavedFiltersApiPath(projectId));
  if (!res.ok) return [];
  const data = (await res.json()) as { savedFilters: SavedFilter[] };
  return data.savedFilters ?? [];
}

export async function persistSavedSearch(
  projectId: string,
  name: string,
  filters: StorySearchFilters,
): Promise<SavedFilter | null> {
  try {
    const res = await fetch(projectSavedFiltersApiPath(projectId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, filters }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { savedFilter: SavedFilter };
    return data.savedFilter ?? null;
  } catch {
    return null;
  }
}

export async function deleteSavedFilterApi(
  projectId: string,
  filterId: string,
): Promise<boolean> {
  try {
    const res = await fetch(projectSavedFilterApiPath(projectId, filterId), {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}
