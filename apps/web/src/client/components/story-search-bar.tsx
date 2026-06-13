import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { StoryType } from "../types/story";
import type { ProjectLabel } from "../types/project-label";
import type { ProjectMemberProfile } from "../types/project";
import { Avatar } from "./avatar";

const STORY_TYPES: StoryType[] = ["feature", "bug", "chore", "release"];
const STORY_TYPE_LABELS: Record<StoryType, string> = {
  feature: "Feature",
  bug: "Bug",
  chore: "Chore",
  release: "Release",
};

export type StorySearchFilters = {
  query: string;
  types: StoryType[];
  unestimatedOnly: boolean;
  ownerIds: string[];
  labels: string[];
  epicIds: string[];
};

type StorySearchBarProps = {
  initialFilters: StorySearchFilters;
  memberOptions: ProjectMemberProfile[];
  projectLabels: ProjectLabel[];
  onFiltersChange: (filters: StorySearchFilters) => void;
  onSaveSearch?: (name: string, filters: StorySearchFilters) => void;
};

export const StorySearchBar = memo(function StorySearchBar({
  initialFilters,
  memberOptions,
  projectLabels,
  onFiltersChange,
  onSaveSearch,
}: StorySearchBarProps) {
  const [filters, setFilters] = useState<StorySearchFilters>(initialFilters);
  const [queryInput, setQueryInput] = useState(initialFilters.query);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const queryInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateFilters = useCallback(
    (patch: Partial<StorySearchFilters>) => {
      const next = { ...filters, ...patch };
      setFilters(next);
      onFiltersChange(next);
    },
    [filters, onFiltersChange],
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      setQueryInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateFilters({ query: value });
      }, 300);
    },
    [updateFilters],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const toggleType = useCallback(
    (type: StoryType) => {
      const types = filters.types.includes(type)
        ? filters.types.filter((t) => t !== type)
        : [...filters.types, type];
      updateFilters({ types });
    },
    [filters.types, updateFilters],
  );

  const toggleOwner = useCallback(
    (userId: string) => {
      const ownerIds = filters.ownerIds.includes(userId)
        ? filters.ownerIds.filter((o) => o !== userId)
        : [...filters.ownerIds, userId];
      updateFilters({ ownerIds });
    },
    [filters.ownerIds, updateFilters],
  );

  const toggleLabel = useCallback(
    (label: string) => {
      const labels = filters.labels.includes(label)
        ? filters.labels.filter((l) => l !== label)
        : [...filters.labels, label];
      updateFilters({ labels });
    },
    [filters.labels, updateFilters],
  );

  const clearAll = useCallback(() => {
    const empty: StorySearchFilters = {
      query: "",
      types: [],
      unestimatedOnly: false,
      ownerIds: [],
      labels: [],
      epicIds: [],
    };
    setFilters(empty);
    onFiltersChange(empty);
    if (queryInputRef.current) {
      queryInputRef.current.value = "";
    }
  }, [onFiltersChange]);

  const hasActiveFilters =
    filters.query ||
    filters.types.length > 0 ||
    filters.unestimatedOnly ||
    filters.ownerIds.length > 0 ||
    filters.labels.length > 0 ||
    filters.epicIds.length > 0;

  const handleSave = useCallback(() => {
    if (onSaveSearch && saveName.trim()) {
      onSaveSearch(saveName.trim(), filters);
      setSaveName("");
      setShowSaveDialog(false);
    }
  }, [filters, onSaveSearch, saveName]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      {/* Text search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={queryInputRef}
            type="text"
            placeholder="タイトル・説明を検索..."
            value={queryInput}
            className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            onChange={(e) => handleQueryChange(e.target.value)}
          />
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            クリア
          </button>
        )}
        {onSaveSearch && hasActiveFilters && (
          <button
            type="button"
            onClick={() => setShowSaveDialog((v) => !v)}
            className="shrink-0 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
          >
            保存
          </button>
        )}
      </div>

      {/* Filter chips row */}
      <div className="flex flex-wrap gap-2">
        {/* Story type filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">タイプ:</span>
          {STORY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                filters.types.includes(type)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {STORY_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={filters.unestimatedOnly}
            onChange={(event) =>
              updateFilters({ unestimatedOnly: event.target.checked })
            }
          />
          未見積もりのみ
        </label>

        {/* Label filter */}
        {projectLabels.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">ラベル:</span>
            <div className="flex flex-wrap gap-1">
              {projectLabels.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => toggleLabel(pl.name)}
                  className={`rounded px-2 py-0.5 text-xs transition-colors ${
                    filters.labels.includes(pl.name)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {pl.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Owner filter */}
        {memberOptions.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">担当者:</span>
            <div className="flex flex-wrap gap-1">
              {memberOptions.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => toggleOwner(member.id)}
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
                    filters.ownerIds.includes(member.id)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                  title={member.displayName}
                >
                  <Avatar
                    displayName={member.displayName}
                    avatarUrl={member.avatarUrl}
                    gravatarUrl={member.gravatarUrl}
                    size="sm"
                  />
                  <span className="max-w-[8rem] truncate">
                    {member.displayName}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Active filter summary */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1">
          {filters.query && (
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
              検索: {filters.query}
              <button
                type="button"
                onClick={() => updateFilters({ query: "" })}
                className="hover:text-destructive"
              >
                ×
              </button>
            </span>
          )}
          {filters.types.map((type) => (
            <span
              key={type}
              className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
            >
              {STORY_TYPE_LABELS[type]}
              <button
                type="button"
                onClick={() => toggleType(type)}
                className="hover:text-destructive"
              >
                ×
              </button>
            </span>
          ))}
          {filters.unestimatedOnly && (
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
              未見積もりのみ
              <button
                type="button"
                onClick={() => updateFilters({ unestimatedOnly: false })}
                className="hover:text-destructive"
              >
                ×
              </button>
            </span>
          )}
          {filters.labels.map((label) => (
            <span
              key={label}
              className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
            >
              {label}
              <button
                type="button"
                onClick={() => toggleLabel(label)}
                className="hover:text-destructive"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Save search dialog */}
      {showSaveDialog && (
        <div className="flex items-center gap-2 border-t border-border pt-2">
          <input
            type="text"
            placeholder="検索条件名を入力..."
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setShowSaveDialog(false);
            }}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!saveName.trim()}
            className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => setShowSaveDialog(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            キャンセル
          </button>
        </div>
      )}
    </div>
  );
});
