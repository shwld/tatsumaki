import type { ProjectMemberRole } from "../domain/entities/project-member";
import type { StoryMapStructure } from "../domain/entities/story-map";

/** Initial limits from ADR-0014 §5. */
export const STORY_MAP_LIVE_LIMITS = {
  maxMessageBytes: 64 * 1024,
  commandsPerSecond: 20,
  maxConnections: 50,
} as const;

export type StoryMapRejectionCode =
  | "invalid"
  | "forbidden"
  | "not_found"
  | "archived"
  | "target_gone"
  | "story_unavailable"
  | "limit"
  | "rate_limited"
  | "internal";

/** `command` is validated by the Durable Object, not trusted here. */
export type StoryMapClientMessage =
  | { type: "command"; opId: string; command: unknown }
  | { type: "resync" };

export type StoryMapServerMessage =
  | {
      type: "snapshot";
      seq: number;
      role: ProjectMemberRole;
      structure: StoryMapStructure;
    }
  | {
      type: "ack";
      opId: string;
      seq: number;
      result: unknown;
      /** True when the op had already been applied and nothing ran again. */
      duplicate: boolean;
    }
  | { type: "reject"; opId: string; code: StoryMapRejectionCode }
  | {
      type: "applied";
      seq: number;
      opId: string;
      actorId: string;
      structure: StoryMapStructure;
    };
