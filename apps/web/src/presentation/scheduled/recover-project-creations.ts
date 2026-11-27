import {
  recoverProjectCreations,
  notifyProjectCreationOutcomes,
} from "../../application/usecases/project-creation-request";
import { D1ProjectCreationRequestRepository } from "../../infrastructure/db/repositories/d1-project-creation-request-repository";
import { ControlPlaneCreationEligibility } from "../../infrastructure/entitlements/control-plane-creation-eligibility";
import type { Bindings } from "../../index";

export async function recoverProjectCreationsScheduled(
  env: Bindings,
): Promise<void> {
  if (env.ENTITLEMENT_MODE !== "control-plane" || !env.CONTROL_PLANE) return;
  const requests = new D1ProjectCreationRequestRepository(env.DB);
  const provider = new ControlPlaneCreationEligibility(env.CONTROL_PLANE);
  try {
    await recoverProjectCreations(
      { requests, eligibility: provider },
      { now: new Date() },
    );
  } catch (error) {
    console.error("Project creation recovery failed", error);
  }
  try {
    await notifyProjectCreationOutcomes({ requests, outcomes: provider });
  } catch (error) {
    console.error("Project creation outcome delivery failed", error);
  }
}
