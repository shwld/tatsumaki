import type { Epic, EpicPlanInput, LabelDeletionImpact } from "../types/epic";

export type PlanningApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; code: string | null; message: string | null };

async function request<T>(
  url: string,
  init: RequestInit | undefined,
  pick: (body: unknown) => T,
): Promise<PlanningApiResult<T>> {
  try {
    const response = await fetch(url, init);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const record =
        typeof body === "object" && body !== null
          ? (body as Record<string, unknown>)
          : {};
      return {
        ok: false,
        status: response.status,
        code: typeof record.code === "string" ? record.code : null,
        message: typeof record.error === "string" ? record.error : null,
      };
    }
    return { ok: true, value: pick(body) };
  } catch {
    return { ok: false, status: 0, code: null, message: null };
  }
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const pickEpic = (body: unknown) => (body as { epic: Epic }).epic;

function labelEpicPath(projectId: string, labelId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/labels/${encodeURIComponent(labelId)}`;
}

export function fetchEpics(projectId: string) {
  return request(
    `/api/projects/${encodeURIComponent(projectId)}/epics`,
    undefined,
    (body) => (body as { epics: Epic[] }).epics,
  );
}

export function fetchEpic(projectId: string, labelId: string) {
  return request(
    `${labelEpicPath(projectId, labelId)}/epic`,
    undefined,
    pickEpic,
  );
}

export function enableEpic(
  projectId: string,
  labelId: string,
  revision: number | null,
) {
  return request(
    `${labelEpicPath(projectId, labelId)}/epic/enable`,
    jsonInit("POST", revision === null ? {} : { revision }),
    pickEpic,
  );
}

export function disableEpic(
  projectId: string,
  labelId: string,
  revision: number,
) {
  return request(
    `${labelEpicPath(projectId, labelId)}/epic/disable`,
    jsonInit("POST", { revision }),
    pickEpic,
  );
}

export function saveEpicPlan(
  projectId: string,
  labelId: string,
  revision: number,
  plan: EpicPlanInput,
) {
  return request(
    `${labelEpicPath(projectId, labelId)}/epic`,
    jsonInit("PATCH", { revision, ...plan }),
    pickEpic,
  );
}

export function fetchLabelDeletionImpact(projectId: string, labelId: string) {
  return request(
    `${labelEpicPath(projectId, labelId)}/deletion-impact`,
    undefined,
    (body) => body as LabelDeletionImpact,
  );
}
