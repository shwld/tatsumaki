import { memo, useCallback, useEffect, useState } from "react";
import type { SavedFilter } from "../types/saved-filter";
import type { StorySearchFilters } from "./story-search-bar";
import {
  fetchSavedFilters,
  deleteSavedFilterApi,
} from "../lib/saved-filter-api";
export { persistSavedSearch } from "../lib/saved-filter-api";

type SavedSearchesProps = {
  projectId: string;
  onApply: (filters: StorySearchFilters) => void;
};

export const SavedSearches = memo(function SavedSearches({
  projectId,
  onApply,
}: SavedSearchesProps) {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSavedFilters = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filters = await fetchSavedFilters(projectId);
      setSavedFilters(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みエラー");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadSavedFilters();
  }, [loadSavedFilters]);

  const handleDelete = useCallback(
    async (filterId: string) => {
      const ok = await deleteSavedFilterApi(projectId, filterId);
      if (ok) {
        setSavedFilters((prev) => prev.filter((f) => f.id !== filterId));
      }
    },
    [projectId],
  );

  const handleApply = useCallback(
    (sf: SavedFilter) => {
      onApply({
        query: sf.filters.query ?? "",
        types: sf.filters.types ?? [],
        unestimatedOnly: sf.filters.unestimatedOnly === true,
        ownerIds: sf.filters.ownerIds ?? [],
        labels: sf.filters.labels ?? [],
        epicIds: sf.filters.epicIds ?? [],
      });
    },
    [onApply],
  );

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">読み込み中...</div>;
  }

  if (error) {
    return <div className="text-xs text-destructive">{error}</div>;
  }

  if (savedFilters.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        保存済み検索条件はありません
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">保存済み検索</p>
      <ul className="flex flex-col gap-0.5">
        {savedFilters.map((sf) => (
          <li
            key={sf.id}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-accent"
          >
            <button
              type="button"
              className="flex-1 text-left text-sm"
              onClick={() => handleApply(sf)}
            >
              {sf.name}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(sf.id)}
              className="text-xs text-muted-foreground hover:text-destructive"
              title="削除"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});
