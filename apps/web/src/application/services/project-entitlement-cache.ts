import type { EntitlementProvider } from "../ports/entitlement-provider";
import type { ProjectEntitlement } from "../../domain/entities/entitlement";

type Entry = { entitlement: ProjectEntitlement; fetchedAtMs: number };

export type ProjectAccessState =
  | { kind: "active" }
  | { kind: "grace"; validUntil: string | null }
  | { kind: "suspended" }
  | { kind: "unknown" };

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
  private readonly highestRevision = new Map<string, number>();
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

  /** Display state; a grace past its deadline reads as suspended, like writes. */
  async accessState(projectId: string): Promise<ProjectAccessState> {
    const entitlement = await this.resolve(projectId);
    if (!entitlement) return { kind: "unknown" };
    if (!this.isWritable(entitlement)) return { kind: "suspended" };
    if (entitlement.state === "grace") {
      return { kind: "grace", validUntil: entitlement.validUntil };
    }
    return { kind: "active" };
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
    const fetched = await this.fetchShared(projectId);
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
      const entitlement = await this.provider.getProjectEntitlement(projectId);
      if (entitlement.projectId !== projectId) return null;
      if (entitlement.revision < (this.highestRevision.get(projectId) ?? 0)) {
        return null;
      }
      this.highestRevision.set(projectId, entitlement.revision);
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
