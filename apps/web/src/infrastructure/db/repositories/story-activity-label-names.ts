import { inArray, sql } from "drizzle-orm";
import type { DbClient } from "../client";
import { projectLabelsTable } from "../schema/project-labels";

type LabelActivityRow = {
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
};

function parseIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * New label activities store label IDs (field `labelIds`); history shows the label's current name.
 * Rows recorded before ID tracking keep the names they were written with (field `labels`).
 */
export async function resolveLabelActivityNames<T extends LabelActivityRow>(
  db: DbClient,
  rows: T[],
): Promise<T[]> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.fieldName !== "labelIds") continue;
    for (const id of parseIds(row.oldValue)) ids.add(id);
    for (const id of parseIds(row.newValue)) ids.add(id);
  }
  if (ids.size === 0) return rows;

  const found = await db
    .select({ id: projectLabelsTable.id, name: projectLabelsTable.name })
    .from(projectLabelsTable)
    .where(
      inArray(
        projectLabelsTable.id,
        sql`(select value from json_each(${JSON.stringify([...ids])}))`,
      ),
    )
    .all();
  const nameById = new Map(found.map((label) => [label.id, label.name]));
  const toNames = (value: string | null): string | null =>
    value === null
      ? null
      : JSON.stringify(
          parseIds(value).map((id) => nameById.get(id) ?? "(deleted label)"),
        );

  return rows.map((row) =>
    row.fieldName === "labelIds"
      ? {
          ...row,
          fieldName: "labels",
          oldValue: toNames(row.oldValue),
          newValue: toNames(row.newValue),
        }
      : row,
  );
}
