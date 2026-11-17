import type { EntitlementProvider } from "../ports/entitlement-provider";
import type { ProjectEntitlement } from "../../domain/entities/entitlement";

type Entry = { entitlement: ProjectEntitlement; fetchedAtMs: number };

export type ProjectWriteDecision =
  | { kind: "allow" }
  | { kind: "suspended" }
  | { kind: "unavailable" };

/**
 * Caches the Control Plane answer per project, using only the lifetimes the
 * response itself carries (ADR-0015). The clock starts when the answer was
 * received, so a cached `active` can never outlive maxAgeSeconds (+
 * staleIfErrorSeconds while the Control Plane is unreachable).
 */
export class ProjectEntitlementCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<Entry | null>>();

  constructor(
    private readonly provider: EntitlementProvider,
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
    const entitlement = await this.resolve(projectId);
    if (!entitlement) return { kind: "unavailable" };
    return this.isWritable(entitlement)
      ? { kind: "allow" }
      : { kind: "suspended" };
  }

  private isWritable(entitlement: ProjectEntitlement): boolean {
    if (entitlement.state === "suspended") return false;
    if (entitlement.state === "grace" && entitlement.validUntil !== null) {
      return this.now() < Date.parse(entitlement.validUntil);
    }
    return true;
  }

  private async resolve(projectId: string): Promise<ProjectEntitlement | null> {
    const cached = this.entries.get(projectId);
    if (cached && this.now() < expiresAt(cached, 0)) {
      return cached.entitlement;
    }
    const fetched = await this.fetchShared(projectId, cached);
    if (fetched) return fetched.entitlement;
    if (
      cached &&
      this.now() <
        expiresAt(cached, cached.entitlement.cache.staleIfErrorSeconds)
    ) {
      return cached.entitlement;
    }
    this.entries.delete(projectId);
    return null;
  }

  private fetchShared(
    projectId: string,
    previous: Entry | undefined,
  ): Promise<Entry | null> {
    const running = this.inflight.get(projectId);
    if (running) return running;
    const started = this.fetch(projectId, previous).finally(() => {
      this.inflight.delete(projectId);
    });
    this.inflight.set(projectId, started);
    return started;
  }

  private async fetch(
    projectId: string,
    previous: Entry | undefined,
  ): Promise<Entry | null> {
    try {
      const entitlement = await this.provider.getProjectEntitlement(projectId);
      if (entitlement.projectId !== projectId) return null;
      if (previous && entitlement.revision < previous.entitlement.revision) {
        return null;
      }
      const entry = { entitlement, fetchedAtMs: this.now() };
      this.entries.set(projectId, entry);
      return entry;
    } catch {
      return null;
    }
  }
}

function expiresAt(entry: Entry, extraSeconds: number): number {
  return (
    entry.fetchedAtMs +
    (entry.entitlement.cache.maxAgeSeconds + extraSeconds) * 1000
  );
}
