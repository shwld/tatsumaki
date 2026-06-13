import { useCallback, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useProjectLabelMutations } from "../hooks/use-project-label-mutations";
import type { ProjectLabel } from "../types/project-label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { UNKNOWN_LABEL_COLOR } from "./story-label-chips";

const DEFAULT_COLOR = "#6b7280";

const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
  "#1e293b",
] as const;

type LabelMultiSelectProps = {
  projectId: string;
  selectedLabels: string[];
  projectLabels: ProjectLabel[];
  disabled?: boolean;
  onSelectedLabelsChange: (labels: string[]) => void;
};

export function LabelMultiSelect({
  projectId,
  selectedLabels,
  projectLabels,
  disabled,
  onSelectedLabelsChange,
}: LabelMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(DEFAULT_COLOR);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);

  const {
    createLabel,
    updateLabel,
    deleteLabel,
    isSubmitting,
    error,
    setError,
  } = useProjectLabelMutations(projectId);

  const unknownLabels = selectedLabels.filter(
    (name) => !projectLabels.some((pl) => pl.name === name),
  );

  const handleToggle = useCallback(
    (labelName: string) => {
      const next = selectedLabels.includes(labelName)
        ? selectedLabels.filter((l) => l !== labelName)
        : [...selectedLabels, labelName];
      onSelectedLabelsChange(next);
    },
    [selectedLabels, onSelectedLabelsChange],
  );

  const handleRemoveChip = useCallback(
    (labelName: string, event: React.MouseEvent) => {
      event.stopPropagation();
      onSelectedLabelsChange(selectedLabels.filter((l) => l !== labelName));
    },
    [selectedLabels, onSelectedLabelsChange],
  );

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    const label = await createLabel({ name: newName.trim(), color: newColor });
    if (label) {
      onSelectedLabelsChange([...selectedLabels, label.name]);
      setNewName("");
      setNewColor(DEFAULT_COLOR);
    }
  }, [createLabel, newName, newColor, selectedLabels, onSelectedLabelsChange]);

  const handleStartEdit = useCallback(
    (label: ProjectLabel) => {
      setEditingLabelId(label.id);
      setEditName(label.name);
      setEditColor(label.color);
      setError(null);
    },
    [setError],
  );

  const handleSaveEdit = useCallback(
    async (label: ProjectLabel) => {
      if (!editName.trim()) return;
      const updated = await updateLabel(label.id, {
        name: editName.trim(),
        color: editColor,
      });
      if (updated) {
        if (
          selectedLabels.includes(label.name) &&
          updated.name !== label.name
        ) {
          onSelectedLabelsChange(
            selectedLabels.map((l) => (l === label.name ? updated.name : l)),
          );
        }
        setEditingLabelId(null);
      }
    },
    [updateLabel, editName, editColor, selectedLabels, onSelectedLabelsChange],
  );

  const handleDelete = useCallback(
    async (label: ProjectLabel) => {
      if (
        !window.confirm(
          `「${label.name}」を削除しますか？\n\nこのラベルを使用している他のストーリーには反映されません。`,
        )
      ) {
        return;
      }
      const success = await deleteLabel(label.id);
      if (success && selectedLabels.includes(label.name)) {
        onSelectedLabelsChange(selectedLabels.filter((l) => l !== label.name));
      }
    },
    [deleteLabel, selectedLabels, onSelectedLabelsChange],
  );

  const visibleChips = selectedLabels.slice(0, 3);
  const extraCount = selectedLabels.length - 3;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="min-h-7 min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-left hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          {selectedLabels.length === 0 ? (
            <span className="text-xs text-gray-400">ラベルを選択</span>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {visibleChips.map((name) => {
                const meta = projectLabels.find((pl) => pl.name === name);
                return (
                  <span
                    key={name}
                    className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                    style={{
                      backgroundColor: meta?.color ?? UNKNOWN_LABEL_COLOR,
                    }}
                  >
                    {name}
                    {!disabled && (
                      <button
                        type="button"
                        className="ml-0.5 opacity-70 hover:opacity-100"
                        onClick={(e) => handleRemoveChip(name, e)}
                        aria-label={`${name} を削除`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                );
              })}
              {extraCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-gray-300 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-slate-600 dark:text-slate-200">
                  +{extraCount}
                </span>
              )}
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="max-h-64 overflow-y-auto">
          {projectLabels.length === 0 && (
            <p className="px-1 py-1 text-xs text-gray-400">
              ラベルがありません
            </p>
          )}
          {projectLabels.map((label) =>
            editingLabelId === label.id ? (
              <div
                key={label.id}
                className="mb-1 space-y-1 rounded border border-gray-200 p-2 dark:border-slate-600"
              >
                <input
                  className="w-full rounded border border-gray-200 px-2 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="ラベル名"
                  disabled={isSubmitting}
                />
                <div className="flex flex-wrap gap-1">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="h-4 w-4 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: color,
                        borderColor:
                          editColor === color ? "#1d4ed8" : "transparent",
                      }}
                      onClick={() => setEditColor(color)}
                      aria-label={color}
                    />
                  ))}
                </div>
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700"
                    onClick={() => setEditingLabelId(null)}
                    disabled={isSubmitting}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-60"
                    onClick={() => void handleSaveEdit(label)}
                    disabled={isSubmitting || !editName.trim()}
                  >
                    保存
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={label.id}
                className="group flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                <button
                  type="button"
                  className="flex flex-1 items-center gap-1.5 text-left"
                  onClick={() => handleToggle(label.name)}
                  disabled={disabled || isSubmitting}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="flex-1 truncate text-xs text-gray-700 dark:text-slate-200">
                    {label.name}
                  </span>
                  {selectedLabels.includes(label.name) && (
                    <Check className="h-3 w-3 shrink-0 text-blue-600" />
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                  <button
                    type="button"
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-slate-700"
                    onClick={() => handleStartEdit(label)}
                    disabled={disabled || isSubmitting}
                    aria-label={`${label.name} を編集`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-red-600 dark:hover:bg-slate-700"
                    onClick={() => void handleDelete(label)}
                    disabled={disabled || isSubmitting}
                    aria-label={`${label.name} を削除`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ),
          )}
          {unknownLabels.length > 0 && (
            <>
              <hr className="my-1 border-gray-100 dark:border-slate-700" />
              <p className="px-1 py-0.5 text-[10px] text-gray-400">
                未定義のラベル
              </p>
              {unknownLabels.map((name) => (
                <div
                  key={name}
                  className="flex items-center gap-1.5 rounded px-1 py-0.5"
                >
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-gray-400" />
                  <span className="flex-1 truncate text-xs text-gray-500 dark:text-slate-400">
                    {name}
                  </span>
                  <Check className="h-3 w-3 shrink-0 text-blue-600" />
                </div>
              ))}
            </>
          )}
        </div>

        <hr className="my-2 border-gray-100 dark:border-slate-700" />

        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-gray-500 dark:text-slate-400">
            新しいラベルを追加
          </p>
          <input
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ラベル名"
            disabled={isSubmitting}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreate();
              }
            }}
          />
          <div className="flex flex-wrap gap-1">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="h-4 w-4 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor: newColor === color ? "#1d4ed8" : "transparent",
                }}
                onClick={() => setNewColor(color)}
                aria-label={color}
              />
            ))}
          </div>
          {error && (
            <p className="text-[10px] text-red-600" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="w-full rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-60"
            onClick={() => void handleCreate()}
            disabled={isSubmitting || !newName.trim()}
          >
            {isSubmitting ? "処理中..." : "追加"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
