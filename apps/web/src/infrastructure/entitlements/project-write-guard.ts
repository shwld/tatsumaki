import {
  ProjectEntitlementCache,
  type ProjectAccessState,
  type ProjectWriteDecision,
} from "../../application/services/project-entitlement-cache";
import {
  ControlPlaneEntitlementProvider,
  type ControlPlaneRpc,
} from "./control-plane-entitlement-provider";

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

const caches = new WeakMap<object, ProjectEntitlementCache>();

const cacheFor = (controlPlane: ControlPlaneRpc): ProjectEntitlementCache => {
  let cache = caches.get(controlPlane);
  if (!cache) {
    cache = new ProjectEntitlementCache(
      new ControlPlaneEntitlementProvider(controlPlane),
    );
    caches.set(controlPlane, cache);
  }
  return cache;
};

export const toProjectWriteDenial = (
  decision: ProjectWriteDecision,
): ProjectWriteDenial | null => {
  if (decision.kind === "suspended") {
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
        error: "Project billing state is unavailable. Try again later.",
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

/** Billing state for display. Not enforcing (self-hosted etc.) is always active. */
export const getProjectAccessState = async (
  bindings: ProjectWriteGuardBindings,
  projectId: string,
): Promise<ProjectAccessState> => {
  if (!isProjectWriteEnforced(bindings)) return { kind: "active" };
  if (!bindings.CONTROL_PLANE) return { kind: "unknown" };
  return cacheFor(bindings.CONTROL_PLANE).accessState(projectId);
};

export const invalidateProjectEntitlement = (
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
 * and nobody while suspended. Role is checked first so billing state is never
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
