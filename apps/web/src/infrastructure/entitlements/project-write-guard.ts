import {
  ProjectUsageCache,
  type ProjectWriteDecision,
} from "../../application/services/project-usage-cache";
import type { ProjectAccessState } from "../../domain/entities/project-usage";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";
import { ControlPlaneUsageProvider } from "./control-plane-usage-provider";

export type ProjectWriteGuardBindings = {
  ENTITLEMENT_MODE?: string;
  PROJECT_WRITE_ENFORCEMENT?: string;
  CONTROL_PLANE?: ControlPlaneRpc;
};

export const PROJECT_SUSPENDED_CODE = "PROJECT_SUSPENDED";
export const ENTITLEMENT_UNAVAILABLE_CODE = "ENTITLEMENT_UNAVAILABLE";

export type ProjectWriteDenial =
  | { status: 403; body: { error: string; code: "PROJECT_SUSPENDED" } }
  | { status: 503; body: { error: string; code: "ENTITLEMENT_UNAVAILABLE" } };

export const isProjectWriteEnforced = (
  bindings: ProjectWriteGuardBindings,
): boolean =>
  bindings.ENTITLEMENT_MODE === "control-plane" &&
  bindings.PROJECT_WRITE_ENFORCEMENT === "true";

const caches = new WeakMap<object, ProjectUsageCache>();

const cacheFor = (controlPlane: ControlPlaneRpc): ProjectUsageCache => {
  let cache = caches.get(controlPlane);
  if (!cache) {
    cache = new ProjectUsageCache(new ControlPlaneUsageProvider(controlPlane));
    caches.set(controlPlane, cache);
  }
  return cache;
};

export const toProjectWriteDenial = (
  decision: ProjectWriteDecision,
): ProjectWriteDenial | null => {
  if (decision.kind === "read_only") {
    return {
      status: 403,
      body: {
        error: "This project is suspended and read-only.",
        code: PROJECT_SUSPENDED_CODE,
      },
    };
  }
  if (decision.kind === "unavailable") {
    return {
      status: 503,
      body: {
        error: "The project usage state is unavailable. Try again later.",
        code: ENTITLEMENT_UNAVAILABLE_CODE,
      },
    };
  }
  return null;
};

/** Every project write path asks this; self-hosted and non-enforcing deployments always allow. */
export const decideProjectWrite = async (
  bindings: ProjectWriteGuardBindings,
  projectId: string,
): Promise<ProjectWriteDecision> => {
  if (!isProjectWriteEnforced(bindings)) return { kind: "allow" };
  if (!bindings.CONTROL_PLANE) return { kind: "unavailable" };
  return cacheFor(bindings.CONTROL_PLANE).decideWrite(projectId);
};

/** Usage state for display. Not enforcing (self-hosted etc.) is always available. */
export const getProjectAccessState = async (
  bindings: ProjectWriteGuardBindings,
  projectId: string,
): Promise<ProjectAccessState> => {
  if (!isProjectWriteEnforced(bindings)) return { kind: "available" };
  if (!bindings.CONTROL_PLANE) return { kind: "unknown" };
  return cacheFor(bindings.CONTROL_PLANE).accessState(projectId);
};

export const invalidateProjectUsage = (
  bindings: ProjectWriteGuardBindings,
  projectId?: string,
): void => {
  if (bindings.CONTROL_PLANE)
    cacheFor(bindings.CONTROL_PLANE).invalidate(projectId);
};

export const EXPORT_OWNER_ONLY_CODE = "EXPORT_OWNER_ONLY";

export type ProjectExportDenial =
  | ProjectWriteDenial
  | { status: 403; body: { error: string; code: "EXPORT_OWNER_ONLY" } };

/**
 * Every project export path asks this (ADR-0015): owners only, in every state,
 * and nobody while view only. Role is checked first so usage state is never
 * revealed to non-owners. Enforcement follows the same switch as writes.
 */
export const decideProjectExport = async (
  bindings: ProjectWriteGuardBindings,
  projectId: string,
  role: "owner" | "member" | "viewer",
): Promise<ProjectExportDenial | null> => {
  if (role !== "owner") {
    return {
      status: 403,
      body: {
        error: "Only the project owner can export project data.",
        code: EXPORT_OWNER_ONLY_CODE,
      },
    };
  }
  return toProjectWriteDenial(await decideProjectWrite(bindings, projectId));
};
