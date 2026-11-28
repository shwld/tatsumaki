import { recoverProjectCreations } from "../../application/usecases/project-creation-request";
import { D1ProjectCreationRequestRepository } from "../../infrastructure/db/repositories/d1-project-creation-request-repository";
import type { Bindings } from "../../index";
import {
  createEntitlementProvider,
  isCheckoutEnabled,
} from "../routes/billing";

/** Never throws: a recovery failure must not affect other scheduled work. */
export async function recoverProjectCreationsScheduled(
  env: Bindings,
): Promise<void> {
  if (!isCheckoutEnabled(env)) return;

  try {
    const summary = await recoverProjectCreations(
      {
        requests: new D1ProjectCreationRequestRepository(env.DB),
        entitlements: createEntitlementProvider(env),
      },
      { now: new Date() },
    );
    if (summary.examined > 0) {
      console.info("Project creation recovery finished", summary);
    }
  } catch (error) {
    console.error("Project creation recovery failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
  }
}
