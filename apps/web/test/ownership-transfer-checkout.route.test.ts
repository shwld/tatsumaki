import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { recoverOwnershipTransfersScheduled } from "../src/presentation/scheduled/recover-ownership-transfers";
import { resetDatabase } from "./helpers/db";
import {
  roleOf,
  seedTransfer,
  setupTransfer,
} from "./helpers/transfer-fixture";

describe("ownership acquisition", () => {
  beforeEach(async () => resetDatabase(env.DB));
  it("lets only the designated recipient start and reuses the operation id", async () => {
    const ctx = setupTransfer();
    const { projectId, transferId } = await seedTransfer(ctx.call);
    for (const userId of ["owner", "carol"])
      expect(
        (await ctx.call(userId, projectId, "POST", "/checkout", { transferId }))
          .status,
      ).toBe(403);
    expect(
      (
        await ctx.call("unknown", projectId, "POST", "/checkout", {
          transferId,
        })
      ).status,
    ).toBe(404);
    expect(
      (await ctx.call("bob", projectId, "POST", "/checkout", { transferId }))
        .status,
    ).toBe(201);
    expect(
      (await ctx.call("bob", projectId, "POST", "/checkout", { transferId }))
        .status,
    ).toBe(201);
    expect(ctx.startOwnershipAcquisition).toHaveBeenCalledTimes(2);
    expect(ctx.startOwnershipAcquisition.mock.calls[0][0]).toMatchObject({
      projectId,
      transferId,
      recipientId: "bob",
    });
    expect(
      (ctx.startOwnershipAcquisition.mock.calls[0][0] as { requestId: string })
        .requestId,
    ).toBe(
      (ctx.startOwnershipAcquisition.mock.calls[1][0] as { requestId: string })
        .requestId,
    );
    expect(await roleOf(projectId, "owner")).toBe("owner");
  });
  it("rejects stale identifiers, ended requests and disabled acquisition", async () => {
    const ctx = setupTransfer();
    const { projectId, transferId } = await seedTransfer(ctx.call);
    expect(
      (
        await ctx.call("bob", projectId, "POST", "/checkout", {
          transferId: "other",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await ctx.call(
          "bob",
          projectId,
          "POST",
          "/checkout",
          { transferId },
          { TRANSFER_CHECKOUT_ENABLED: "false" },
        )
      ).status,
    ).toBe(409);
    await ctx.call("owner", projectId, "POST", "/cancel", { transferId });
    expect(
      (await ctx.call("bob", projectId, "POST", "/checkout", { transferId }))
        .status,
    ).toBe(409);
    expect(ctx.startOwnershipAcquisition).not.toHaveBeenCalled();
  });
  it("does not expose an acquisition URL when cancellation races with acquisition", async () => {
    const ctx = setupTransfer();
    const { projectId, transferId } = await seedTransfer(ctx.call);
    ctx.state.onStart = async () => {
      await ctx.call("owner", projectId, "POST", "/cancel", { transferId });
    };
    expect(
      (await ctx.call("bob", projectId, "POST", "/checkout", { transferId }))
        .status,
    ).toBe(409);
    await recoverOwnershipTransfersScheduled(ctx.bindings);
    expect(ctx.recordOwnershipTransferOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ transferId, outcome: "not-switched" }),
    );
    expect(await roleOf(projectId, "owner")).toBe("owner");
  });
  it("does not start the next acquisition before the earlier result is delivered", async () => {
    const ctx = setupTransfer();
    const { projectId } = await seedTransfer(ctx.call);
    ctx.state.eligibility = "allowed";
    ctx.state.deliveryUnavailable = true;
    await ctx.call("bob", projectId, "GET");
    const response = await ctx.call("bob", projectId, "POST", "", {
      toUserId: "carol",
    });
    const { transfer } = (await response.json()) as {
      transfer: { id: string };
    };
    expect(response.status).toBe(201);
    expect(
      (
        await ctx.call("carol", projectId, "POST", "/checkout", {
          transferId: transfer.id,
        })
      ).status,
    ).toBe(503);
    expect(ctx.startOwnershipAcquisition).not.toHaveBeenCalled();
  });

  it("rejects acquisition while deletion is pending or the provider is unavailable", async () => {
    const ctx = setupTransfer();
    const { projectId, transferId } = await seedTransfer(ctx.call);
    await env.DB.prepare(
      "INSERT INTO project_deletion_requests (project_id, requested_by_user_id) VALUES (?, 'owner')",
    )
      .bind(projectId)
      .run();
    expect(
      (await ctx.call("bob", projectId, "POST", "/checkout", { transferId }))
        .status,
    ).toBe(409);
    await env.DB.prepare(
      "DELETE FROM project_deletion_requests WHERE project_id = ?",
    )
      .bind(projectId)
      .run();
    ctx.state.unavailable = true;
    expect(
      (await ctx.call("bob", projectId, "POST", "/checkout", { transferId }))
        .status,
    ).toBe(503);
  });
});
