import { ulid } from "ulid";
import type { StoryMapStoryCandidate } from "../../application/usecases/manage-story-maps";
import type {
  StoryMap,
  StoryMapRole,
  StoryMapStructure,
} from "../types/story-map";

export type StoryMapApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; code: string | null };

async function request<T>(
  url: string,
  init: RequestInit | undefined,
  pick: (body: unknown) => T,
): Promise<StoryMapApiResult<T>> {
  try {
    const response = await fetch(url, init);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code =
        typeof body === "object" &&
        body !== null &&
        typeof (body as { code?: unknown }).code === "string"
          ? (body as { code: string }).code
          : null;
      return { ok: false, status: response.status, code };
    }
    return { ok: true, value: pick(body) };
  } catch {
    return { ok: false, status: 0, code: null };
  }
}

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/story-maps`;

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export type StoryMapList = { storyMaps: StoryMap[]; role: StoryMapRole };
export type StoryMapDetail = {
  structure: StoryMapStructure;
  role: StoryMapRole;
};

export function fetchStoryMaps(projectId: string, includeArchived: boolean) {
  return request(
    `${base(projectId)}?includeArchived=${includeArchived}`,
    undefined,
    (body) => body as StoryMapList,
  );
}

export function fetchStoryMap(projectId: string, mapId: string) {
  return request(
    `${base(projectId)}/${encodeURIComponent(mapId)}`,
    undefined,
    (body) => body as StoryMapDetail,
  );
}

export type CreateStoryMapInput = {
  title: string;
  achievementGoal: string;
  personaNames: string[];
};

export function createStoryMap(projectId: string, input: CreateStoryMapInput) {
  return request(
    base(projectId),
    jsonInit("POST", input),
    (body) => (body as { storyMap: StoryMap }).storyMap,
  );
}

export type StoryMapMetadataCommand =
  | {
      type: "updateMap";
      title?: string;
      achievementGoal?: string;
      archived?: boolean;
    }
  | { type: "addPersona"; name: string }
  | { type: "renamePersona"; personaId: string; name: string }
  | { type: "removePersona"; personaId: string };

/** Writes go through the map's Durable Object so live editors see them (ADR-0014). */
export function sendStoryMapCommand(
  projectId: string,
  mapId: string,
  command: StoryMapMetadataCommand,
) {
  return request(
    `${base(projectId)}/${encodeURIComponent(mapId)}/commands`,
    jsonInit("POST", { opId: ulid(), command }),
    () => undefined,
  );
}

export type { StoryMapStoryCandidate };

export function searchStoriesForCard(
  projectId: string,
  mapId: string,
  query: string,
) {
  return request(
    `${base(projectId)}/${encodeURIComponent(mapId)}/story-search?q=${encodeURIComponent(query)}`,
    undefined,
    (body) => (body as { stories: StoryMapStoryCandidate[] }).stories,
  );
}
