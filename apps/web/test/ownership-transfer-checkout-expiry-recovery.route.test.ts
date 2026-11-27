import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { recoverOwnershipTransfersScheduled } from "../src/presentation/scheduled/recover-ownership-transfers";
import { resetDatabase } from "./helpers/db";
import {
  roleOf,
  seedTransfer,
  setupTransfer,
} from "./helpers/transfer-fixture";

describe("ended transfer result recovery", () => {
  beforeEach(async () => resetDatabase(env.DB));
  it.each([
    ["owner", "/cancel"],
    ["bob", "/decline"],
  ])("retries %s ending while the provider is down", async (userId, path) => {
    const ctx = setupTransfer();
    const { projectId, transferId } = await seedTransfer(ctx.call);
    ctx.state.deliveryUnavailable = true;
    expect(
      (await ctx.call(userId, projectId, "POST", path, { transferId })).status,
    ).toBe(200);
    await recoverOwnershipTransfersScheduled(ctx.bindings);
    expect(
      await env.DB.prepare(
        "SELECT outcome_notified FROM project_ownership_transfers WHERE id = ?",
      )
        .bind(transferId)
        .first(),
    ).toEqual({ outcome_notified: 0 });
    ctx.state.deliveryUnavailable = false;
    await recoverOwnershipTransfersScheduled(ctx.bindings);
    expect(ctx.recordOwnershipTransferOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ transferId, outcome: "not-switched" }),
    );
    expect(
      await env.DB.prepare(
        "SELECT outcome_notified FROM project_ownership_transfers WHERE id = ?",
      )
        .bind(transferId)
        .first(),
    ).toEqual({ outcome_notified: 1 });
    expect(await roleOf(projectId, "owner")).toBe("owner");
  });
});
