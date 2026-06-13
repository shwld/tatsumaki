import { useMemo } from "react";
import type { ProjectLabel } from "../types/project-label";

export const UNKNOWN_LABEL_COLOR = "#6b7280";

type StoryLabelChipsProps = {
  labels: string[];
  projectLabels?: ProjectLabel[];
  maxVisible?: number;
};

export function StoryLabelChips({
  labels,
  projectLabels,
  maxVisible = 3,
}: StoryLabelChipsProps) {
  const labelMap = useMemo(
    () => new Map(projectLabels?.map((pl) => [pl.name, pl]) ?? []),
    [projectLabels],
  );

  if (labels.length === 0) return null;

  const visible = labels.slice(0, maxVisible);
  const extra = labels.length - maxVisible;

  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {visible.map((name) => {
        const meta = labelMap.get(name);
        return (
          <span
            key={name}
            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: meta?.color ?? UNKNOWN_LABEL_COLOR }}
          >
            {name}
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="inline-flex items-center rounded-full bg-gray-300 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-slate-600 dark:text-slate-200">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}
