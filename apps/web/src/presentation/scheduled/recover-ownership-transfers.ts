import { recoverOwnershipTransfers } from "../../application/usecases/advance-ownership-transfer";
import { D1ProjectOwnershipTransferRepository } from "../../infrastructure/db/repositories/d1-project-ownership-transfer-repository";
import type { Bindings } from "../../index";
import { createTransferServices } from "../routes/usage";

/** Never throws: a recovery failure must not affect other scheduled work. */
export async function recoverOwnershipTransfersScheduled(
  env: Bindings,
): Promise<void> {
  try {
    const services = createTransferServices(env);
    if (!services) return;
    const summary = await recoverOwnershipTransfers(
      {
        transfers: new D1ProjectOwnershipTransferRepository(env.DB),
        ...services,
      },
      new Date(),
    );
    if (summary.pending > 0 || summary.unnotified > 0) {
      console.info("Ownership transfer recovery finished", summary);
    }
  } catch (error) {
    console.error("Ownership transfer recovery failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
  }
}
