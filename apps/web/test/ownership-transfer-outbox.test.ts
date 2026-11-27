import { env } from "cloudflare:test";
import { notifyOwnershipTransferOutcomes } from "../src/application/usecases/notify-ownership-transfer-outcomes";
import { vi } from "vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { D1ProjectRepository } from "../src/infrastructure/db/repositories/d1-project-repository";
import { D1ProjectOwnershipTransferRepository } from "../src/infrastructure/db/repositories/d1-project-ownership-transfer-repository";
import { resetDatabase } from "./helpers/db";

describe("transfer outcome outbox", () => {
  beforeEach(async () => resetDatabase(env.DB));
  it("does not switch again before the previous outcome is accepted", async () => {
    const project = (
      await new D1ProjectRepository(env.DB).create({
        name: "P",
        ownerUserId: "owner",
      })
    )._unsafeUnwrap();
    await env.DB.prepare(
      "INSERT INTO project_members (project_id, user_id, role) VALUES (?, 'bob', 'member'), (?, 'carol', 'member')",
    )
      .bind(project.id, project.id)
      .run();
    const repository = new D1ProjectOwnershipTransferRepository(env.DB);
    const now = new Date("2026-11-27T12:00:00.000Z");
    const first = (
      await repository.create({
        projectId: project.id,
        fromUserId: "owner",
        toUserId: "bob",
        now,
      })
    )._unsafeUnwrap();
    expect(
      (await repository.complete({ id: first.id, now }))._unsafeUnwrap(),
    ).toBe(true);
    const second = (
      await repository.create({
        projectId: project.id,
        fromUserId: "bob",
        toUserId: "carol",
        now,
      })
    )._unsafeUnwrap();
    expect(
      (await repository.complete({ id: second.id, now }))._unsafeUnwrap(),
    ).toBe(false);
    await repository.markOutcomeNotified(first.id);
    expect(
      (await repository.complete({ id: second.id, now }))._unsafeUnwrap(),
    ).toBe(true);
  });

  it("records one outcome when cancellation races with completion", async () => {
    const project = (
      await new D1ProjectRepository(env.DB).create({
        name: "P",
        ownerUserId: "owner",
      })
    )._unsafeUnwrap();
    await env.DB.prepare(
      "INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'member')",
    )
      .bind(project.id, "recipient")
      .run();
    const repository = new D1ProjectOwnershipTransferRepository(env.DB);
    const now = new Date("2026-11-27T12:00:00.000Z");
    const transfer = (
      await repository.create({
        projectId: project.id,
        fromUserId: "owner",
        toUserId: "recipient",
        now,
      })
    )._unsafeUnwrap();
    const [completed, cancelled] = await Promise.all([
      repository.complete({ id: transfer.id, now }),
      repository.close({ id: transfer.id, status: "cancelled", now }),
    ]);
    expect(
      Number(completed._unsafeUnwrap()) + Number(cancelled._unsafeUnwrap()),
    ).toBe(1);
    const outcomes = (
      await repository.listUnnotifiedOutcomes(10)
    )._unsafeUnwrap();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].status).toBe(
      completed._unsafeUnwrap() ? "completed" : "cancelled",
    );
    const owners = await env.DB.prepare(
      "SELECT user_id FROM project_members WHERE project_id = ? AND role = 'owner'",
    )
      .bind(project.id)
      .all();
    expect(owners.results).toHaveLength(1);
    const recordOutcome = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(undefined);
    const provider = {
      getEligibility: vi.fn(),
      recordOutcome,
      startAcquisition: vi.fn(),
    };
    await notifyOwnershipTransferOutcomes({ transfers: repository, provider });
    expect(
      (await repository.listUnnotifiedOutcomes(10))._unsafeUnwrap(),
    ).toHaveLength(1);
    await notifyOwnershipTransferOutcomes({ transfers: repository, provider });
    expect(recordOutcome).toHaveBeenCalledTimes(2);
    expect(
      (await repository.listUnnotifiedOutcomes(10))._unsafeUnwrap(),
    ).toHaveLength(0);
  });
});
