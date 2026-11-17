import {
  ProjectEntitlementCache,
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

export const invalidateProjectEntitlement = (
  bindings: ProjectWriteGuardBindings,
  projectId?: string,
): void => {
  if (bindings.CONTROL_PLANE)
    cacheFor(bindings.CONTROL_PLANE).invalidate(projectId);
};
