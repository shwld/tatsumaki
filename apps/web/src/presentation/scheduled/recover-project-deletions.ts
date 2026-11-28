import { recoverProjectDeletions } from "../../application/usecases/delete-project";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
import type { Bindings } from "../../index";
import { createProjectDeletionNotifications } from "../routes/billing";

/** Never throws: a recovery failure must not affect other scheduled work. */
export async function recoverProjectDeletionsScheduled(
  env: Bindings,
): Promise<void> {
  try {
    const notifications = createProjectDeletionNotifications(env);
    if (!notifications) return;
    const summary = await recoverProjectDeletions({
      repository: new D1ProjectRepository(env.DB),
      notifications,
    });
    if (summary.examined > 0) {
      console.info("Project deletion recovery finished", summary);
    }
  } catch (error) {
    console.error("Project deletion recovery failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
  }
}
