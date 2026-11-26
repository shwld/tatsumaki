import type { ProjectUsageProvider } from "../ports/project-usage-provider";
import type {
  ProjectAccessState,
  ProjectUsage,
} from "../../domain/entities/project-usage";

type Entry = { usage: ProjectUsage; fetchedAtMs: number };

export type ProjectWriteDecision =
  | { kind: "allow" }
  | { kind: "read_only" }
  | { kind: "unavailable" };

/**
 * Caches the Control Plane answer per project, using only the lifetimes the
 * response itself carries (ADR-0016). The clock starts when the answer was
 * received, so a cached permission can never outlive maxAgeSeconds (+
 * staleIfErrorSeconds while the Control Plane is unreachable).
 */
export class ProjectUsageCache {
  private readonly entries = new Map<string, Entry>();
  private readonly highestRevision = new Map<string, number>();
  private readonly inflight = new Map<string, Promise<Entry | null>>();

  constructor(
    private readonly provider: ProjectUsageProvider,
    private readonly now: () => number = Date.now,
  ) {}

  invalidate(projectId?: string): void {
    if (projectId === undefined) {
      this.entries.clear();
      return;
    }
    this.entries.delete(projectId);
  }

  async decideWrite(projectId: string): Promise<ProjectWriteDecision> {
    const usage = await this.resolve(projectId);
    if (!usage) return { kind: "unavailable" };
    return this.isWritable(usage) ? { kind: "allow" } : { kind: "read_only" };
  }

  /** Display state; a project past its deadline reads as view only, like writes. */
  async accessState(projectId: string): Promise<ProjectAccessState> {
    const usage = await this.resolve(projectId);
    if (!usage) return { kind: "unknown" };
    if (!this.isWritable(usage)) return { kind: "read_only" };
    if (usage.until !== null) {
      return {
        kind: "limited",
        until: usage.until,
        untilReason: usage.untilReason,
      };
    }
    return { kind: "available" };
  }

  private isWritable(usage: ProjectUsage): boolean {
    if (!usage.allowed) return false;
    return usage.until === null || this.now() < Date.parse(usage.until);
  }

  private async resolve(projectId: string): Promise<ProjectUsage | null> {
    const cached = this.entries.get(projectId);
    if (cached && this.now() < expiresAt(cached, 0)) {
      return cached.usage;
    }
    const fetched = await this.fetchShared(projectId);
    if (fetched) return fetched.usage;
    if (
      cached &&
      this.now() < expiresAt(cached, cached.usage.cache.staleIfErrorSeconds)
    ) {
      return cached.usage;
    }
    this.entries.delete(projectId);
    return null;
  }

  private fetchShared(projectId: string): Promise<Entry | null> {
    const running = this.inflight.get(projectId);
    if (running) return running;
    const started = this.fetch(projectId).finally(() => {
      this.inflight.delete(projectId);
    });
    this.inflight.set(projectId, started);
    return started;
  }

  private async fetch(projectId: string): Promise<Entry | null> {
    try {
      const usage = await this.provider.getProjectUsage(projectId);
      if (usage.projectId !== projectId) return null;
      if (usage.revision < (this.highestRevision.get(projectId) ?? 0)) {
        return null;
      }
      this.highestRevision.set(projectId, usage.revision);
      const entry = { usage, fetchedAtMs: this.now() };
      this.entries.set(projectId, entry);
      return entry;
    } catch {
      return null;
    }
  }
}

function expiresAt(entry: Entry, extraSeconds: number): number {
  return (
    entry.fetchedAtMs + (entry.usage.cache.maxAgeSeconds + extraSeconds) * 1000
  );
}
