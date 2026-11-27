import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import { recoverOwnershipTransfersScheduled } from "../src/presentation/scheduled/recover-ownership-transfers";
import { resetDatabase } from "./helpers/db";
import {
  roleOf,
  seedTransfer,
  setupTransfer,
} from "./helpers/transfer-fixture";

describe("transfer participants", () => {
  beforeEach(async () => resetDatabase(env.DB));
  it("ends a transfer when the requester loses owner status and does not revive it", async () => {
    const ctx = setupTransfer();
    const { projectId, transferId } = await seedTransfer(ctx.call);
    await env.DB.prepare(
      "UPDATE project_members SET role = 'owner' WHERE project_id = ? AND user_id = 'carol'",
    )
      .bind(projectId)
      .run();
    const repository = new D1ProjectRepository(env.DB);
    expect(
      (
        await repository.updateMemberRole({
          projectId,
          userId: "owner",
          role: "member",
          now: new Date(),
        })
      ).isOk(),
    ).toBe(true);
    expect(
      (
        await repository.updateMemberRole({
          projectId,
          userId: "owner",
          role: "owner",
          now: new Date(),
        })
      ).isOk(),
    ).toBe(true);
    ctx.state.eligibility = "allowed";
    await recoverOwnershipTransfersScheduled(ctx.bindings);
    expect(ctx.recordOwnershipTransferOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ transferId, outcome: "not-switched" }),
    );
    expect(await roleOf(projectId, "bob")).toBe("member");
  });
  it("keeps the request when the recipient remains eligible", async () => {
    const ctx = setupTransfer();
    const { projectId, transferId } = await seedTransfer(ctx.call);
    const result = await new D1ProjectRepository(env.DB).updateMemberRole({
      projectId,
      userId: "bob",
      role: "viewer",
      now: new Date(),
    });
    expect(result.isOk()).toBe(true);
    const row = await env.DB.prepare(
      "SELECT status FROM project_ownership_transfers WHERE id = ?",
    )
      .bind(transferId)
      .first();
    expect(row).toEqual({ status: "pending" });
  });
  it("does not remove the only owner", async () => {
    const ctx = setupTransfer();
    const { projectId } = await seedTransfer(ctx.call);
    const result = await new D1ProjectRepository(env.DB).updateMemberRole({
      projectId,
      userId: "owner",
      role: "member",
      now: new Date(),
    });
    expect(result.isErr()).toBe(true);
    expect(await roleOf(projectId, "owner")).toBe("owner");
  });
});
