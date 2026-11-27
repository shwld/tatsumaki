import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { recoverOwnershipTransfersScheduled } from "../src/presentation/scheduled/recover-ownership-transfers";
import { resetDatabase } from "./helpers/db";
import {
  roleOf,
  seedTransfer,
  setupTransfer,
} from "./helpers/transfer-fixture";

describe("ownership transfer result delivery", () => {
  beforeEach(async () => resetDatabase(env.DB));
  it("switches the owner once and delivers the result", async () => {
    const ctx = setupTransfer();
    const { projectId, transferId } = await seedTransfer(ctx.call);
    ctx.state.eligibility = "allowed";
    expect((await ctx.call("bob", projectId, "GET")).status).toBe(200);
    expect(await roleOf(projectId, "owner")).toBe("member");
    expect(await roleOf(projectId, "bob")).toBe("owner");
    expect(ctx.recordOwnershipTransferOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ projectId, transferId, outcome: "switched" }),
    );
    await ctx.call("bob", projectId, "GET");
    expect(ctx.recordOwnershipTransferOutcome).toHaveBeenCalledTimes(1);
  });
  it.each([
    "pending",
    "unavailable",
  ] as const)("does not switch when eligibility is %s", async (status) => {
    const ctx = setupTransfer();
    const { projectId } = await seedTransfer(ctx.call);
    if (status === "unavailable") ctx.state.unavailable = true;
    await ctx.call("bob", projectId, "GET");
    expect(await roleOf(projectId, "owner")).toBe("owner");
    expect(await roleOf(projectId, "bob")).toBe("member");
  });
  it("closes a denied transfer and delivers the unsuccessful outcome", async () => {
    const ctx = setupTransfer();
    const { projectId, transferId } = await seedTransfer(ctx.call);
    ctx.state.eligibility = "denied";
    await recoverOwnershipTransfersScheduled(ctx.bindings);
    expect(await roleOf(projectId, "owner")).toBe("owner");
    expect(ctx.recordOwnershipTransferOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ transferId, outcome: "not-switched" }),
    );
  });
  it("retains the result while the provider is unavailable and retries", async () => {
    const ctx = setupTransfer();
    const { projectId, transferId } = await seedTransfer(ctx.call);
    ctx.state.eligibility = "allowed";
    ctx.state.deliveryUnavailable = true;
    await ctx.call("bob", projectId, "GET");
    expect(await roleOf(projectId, "bob")).toBe("owner");
    const row = await env.DB.prepare(
      "SELECT outcome_notified FROM project_ownership_transfers WHERE id = ?",
    )
      .bind(transferId)
      .first<{ outcome_notified: number }>();
    expect(row?.outcome_notified).toBe(0);
    ctx.state.deliveryUnavailable = false;
    await recoverOwnershipTransfersScheduled(ctx.bindings);
    expect(
      await env.DB.prepare(
        "SELECT outcome_notified FROM project_ownership_transfers WHERE id = ?",
      )
        .bind(transferId)
        .first(),
    ).toEqual({ outcome_notified: 1 });
  });
  it("does not switch while project deletion is pending", async () => {
    const ctx = setupTransfer();
    const { projectId, transferId } = await seedTransfer(ctx.call);
    await env.DB.prepare(
      "INSERT INTO project_deletion_requests (project_id, requested_by_user_id) VALUES (?, 'owner')",
    )
      .bind(projectId)
      .run();
    ctx.state.eligibility = "allowed";
    await recoverOwnershipTransfersScheduled(ctx.bindings);
    expect(await roleOf(projectId, "owner")).toBe("owner");
    expect(ctx.recordOwnershipTransferOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ transferId, outcome: "not-switched" }),
    );
  });
  it("reports an unfinished transfer when its project is deleted", async () => {
    const ctx = setupTransfer();
    const { projectId, transferId } = await seedTransfer(ctx.call);
    await env.DB.prepare("DELETE FROM projects WHERE id = ?")
      .bind(projectId)
      .run();
    await recoverOwnershipTransfersScheduled(ctx.bindings);
    expect(ctx.recordOwnershipTransferOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ transferId, outcome: "not-switched" }),
    );
  });

  it("expires unattended requests and reports the outcome", async () => {
    const ctx = setupTransfer();
    const { projectId, transferId } = await seedTransfer(ctx.call);
    await env.DB.prepare(
      "UPDATE project_ownership_transfers SET expires_at = ? WHERE id = ?",
    )
      .bind("2000-01-01T00:00:00.000Z", transferId)
      .run();
    await recoverOwnershipTransfersScheduled(ctx.bindings);
    expect(await roleOf(projectId, "owner")).toBe("owner");
    expect(ctx.recordOwnershipTransferOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ transferId, outcome: "not-switched" }),
    );
  });
});
