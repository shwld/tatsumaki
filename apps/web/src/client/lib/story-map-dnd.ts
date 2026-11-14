export type DragKind = "activity" | "task" | "slice" | "card";
export type DragItem = { kind: DragKind; id: string };
export type DropSide = "before" | "after";

/**
 * ADR-0014 commands name the destination by the element it follows. The
 * dragged element is excluded first, so dropping next to oneself is a no-op
 * and the id never refers to the element being moved.
 */
export function afterIdFor(
  orderedIds: readonly string[],
  draggedId: string,
  targetId: string,
  side: DropSide,
): string | null {
  const rest = orderedIds.filter((id) => id !== draggedId);
  const index = rest.indexOf(targetId);
  if (index === -1) return rest.at(-1) ?? null;
  return side === "after" ? targetId : (rest[index - 1] ?? null);
}

/** Which half of the element the pointer is over, along the sorting axis. */
export function sideOf(
  event: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
  axis: "x" | "y",
): DropSide {
  const offset =
    axis === "x"
      ? event.clientX - rect.left - rect.width / 2
      : event.clientY - rect.top - rect.height / 2;
  return offset < 0 ? "before" : "after";
}

export type DropIndicator = { key: string; side: DropSide | "end" };

export function dropKey(kind: DragKind | "cell", id: string): string {
  return `${kind}:${id}`;
}

const SIDE_SHADOW: Record<string, string> = {
  "x:before": "shadow-[inset_4px_0_0_0_#3b82f6]",
  "x:after": "shadow-[inset_-4px_0_0_0_#3b82f6]",
  "y:before": "shadow-[inset_0_4px_0_0_#3b82f6]",
  "y:after": "shadow-[inset_0_-4px_0_0_#3b82f6]",
  "y:end": "bg-blue-50 shadow-[inset_0_0_0_2px_#3b82f6] dark:bg-slate-800",
  "x:end": "bg-blue-50 shadow-[inset_0_0_0_2px_#3b82f6] dark:bg-slate-800",
};

export function indicatorClass(
  indicator: DropIndicator | null,
  key: string,
  axis: "x" | "y",
): string {
  if (!indicator || indicator.key !== key) return "";
  return SIDE_SHADOW[`${axis}:${indicator.side}`] ?? "";
}
