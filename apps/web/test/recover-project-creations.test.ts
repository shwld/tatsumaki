import { err, ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import {
  recoverProjectCreations,
  notifyProjectCreationOutcomes,
  RECOVERY_MAX_MATERIALIZE_FAILURES,
} from "../src/application/usecases/project-creation-request";
import { PROJECT_CREATION_REQUEST_REPOSITORY_ERROR } from "../src/domain/repositories/project-creation-request-repository";
import type { ProjectCreationRequestRepository } from "../src/domain/repositories/project-creation-request-repository";
import type { ProjectCreationEligibilityGateway } from "../src/application/ports/project-creation-eligibility";

const now = new Date("2026-11-18T12:00:00.000Z");
const request = {
  projectId: "p1",
  purchaserUserId: "u1",
  name: "Project",
  idempotencyKey: "key-12345678",
  checkoutRequestId: "c1",
  status: "pending" as const,
  attemptCount: 0,
  materializeFailureCount: 0,
  stalledReason: null,
  createdAt: "2026-11-18 11:59:00",
};
function setup(
  eligibility: ProjectCreationEligibilityGateway["getEligibility"],
) {
  const requests = {
    listRecoverable: vi.fn(async () => ok([request])),
    materialize: vi.fn<ProjectCreationRequestRepository["materialize"]>(
      async () => ok({} as never),
    ),
    markFailed: vi.fn(async () => ok(true)),
    recordAttempt: vi.fn(async () => ok(undefined)),
    listUnnotified: vi.fn<ProjectCreationRequestRepository["listUnnotified"]>(
      async () => ok([]),
    ),
    markNotified: vi.fn(async () => ok(undefined)),
    markNotificationAttempt: vi.fn(async () => ok(undefined)),
  };
  return {
    requests,
    deps: {
      requests: requests as unknown as ProjectCreationRequestRepository,
      eligibility: { getEligibility: eligibility },
    },
  };
}
describe("project creation recovery", () => {
  it("creates only when the provider allows it", async () => {
    const { requests, deps } = setup(async () => ({ status: "allowed" }));
    await recoverProjectCreations(deps, { now });
    expect(requests.materialize).toHaveBeenCalledOnce();
  });
  it("records a denied outcome rather than creating", async () => {
    const { requests, deps } = setup(async () => ({ status: "denied" }));
    await recoverProjectCreations(deps, { now });
    expect(requests.materialize).not.toHaveBeenCalled();
    expect(requests.markFailed).toHaveBeenCalledWith("p1", now.toISOString());
  });
  it("retries pending and unavailable checks without abandoning them", async () => {
    for (const eligibility of [
      async () => ({
        status: "pending" as const,
        deadline: "2026-11-19T00:00:00.000Z",
      }),
      async () => {
        throw new Error("unavailable");
      },
    ]) {
      const { requests, deps } = setup(eligibility);
      await recoverProjectCreations(deps, { now });
      expect(requests.markFailed).not.toHaveBeenCalled();
      expect(requests.recordAttempt).toHaveBeenCalledOnce();
    }
  });
  it("records failure after repeated materialization failures", async () => {
    const { requests, deps } = setup(async () => ({ status: "allowed" }));
    requests.listRecoverable.mockResolvedValueOnce(
      ok([
        {
          ...request,
          materializeFailureCount: RECOVERY_MAX_MATERIALIZE_FAILURES - 1,
        },
      ]),
    );
    requests.materialize.mockResolvedValueOnce(
      err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR),
    );
    await recoverProjectCreations(deps, { now });
    expect(requests.markFailed).toHaveBeenCalledOnce();
  });
  it("only marks outcomes delivered after the provider accepts them", async () => {
    const { requests, deps } = setup(async () => ({ status: "allowed" }));
    const outcome = {
      projectId: "p1",
      accountId: "u1",
      outcome: "failed" as const,
      occurredAt: now.toISOString(),
    };
    requests.listUnnotified.mockResolvedValue(ok([outcome]));
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(undefined);
    await notifyProjectCreationOutcomes({
      requests: deps.requests,
      outcomes: { recordOutcome: send },
    });
    expect(requests.markNotified).not.toHaveBeenCalled();
    await notifyProjectCreationOutcomes({
      requests: deps.requests,
      outcomes: { recordOutcome: send },
    });
    expect(requests.markNotified).toHaveBeenCalledWith("p1");
  });
});
