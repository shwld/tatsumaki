import { err, ok } from "neverthrow";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RECOVERY_ABANDON_AFTER_MS,
  RECOVERY_MAX_MATERIALIZE_FAILURES,
  RECOVERY_MAX_UNVERIFIED_AGE_MS,
  recoverProjectCreations,
} from "../src/application/usecases/project-creation-request";
import type { ProjectCreationRequest } from "../src/domain/entities/project-creation-request";
import {
  PROJECT_CREATION_REQUEST_REPOSITORY_ERROR,
  type ProjectCreationRequestRepository,
  type RecordCreationAttemptInput,
} from "../src/domain/repositories/project-creation-request-repository";
import type { EntitlementProvider } from "../src/application/ports/entitlement-provider";

const NOW = new Date("2026-11-18T12:00:00.000Z");

const sqliteTime = (ageMs: number) =>
  new Date(NOW.getTime() - ageMs)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, "");

const makeRequest = (
  overrides: Partial<ProjectCreationRequest> = {},
): ProjectCreationRequest => ({
  projectId: "p1",
  purchaserUserId: "u1",
  name: "Project",
  idempotencyKey: "key-12345678",
  checkoutRequestId: "c1",
  status: "pending",
  attemptCount: 0,
  materializeFailureCount: 0,
  paymentEvidence: false,
  stalledReason: null,
  createdAt: sqliteTime(60 * 1000),
  ...overrides,
});

const setup = (options: {
  requests: ProjectCreationRequest[];
  entitlement: () => Promise<{ state: string }>;
  materializeOk?: boolean;
}) => {
  const attempts: RecordCreationAttemptInput[] = [];
  const materialize = vi.fn(async () =>
    options.materializeOk === false
      ? err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR)
      : ok({} as never),
  );
  const requests = {
    listRecoverable: vi.fn(async () => ok(options.requests)),
    recordAttempt: vi.fn(async (input: RecordCreationAttemptInput) => {
      attempts.push(input);
      return ok(undefined);
    }),
    materialize,
  } as unknown as ProjectCreationRequestRepository;
  const entitlements = {
    getProjectEntitlement: vi.fn(options.entitlement),
  } as unknown as EntitlementProvider;
  return { deps: { requests, entitlements }, attempts, materialize };
};

describe("recoverProjectCreations", () => {
  afterEach(() => vi.restoreAllMocks());

  it("materializes an active request without the success page", async () => {
    const { deps, materialize, attempts } = setup({
      requests: [makeRequest()],
      entitlement: async () => ({ state: "active" }),
    });

    const summary = await recoverProjectCreations(deps, { now: NOW });

    expect(summary.created).toBe(1);
    expect(materialize).toHaveBeenCalledTimes(1);
    expect(attempts).toHaveLength(0);
  });

  it("does not create for unpaid or non-active requests and keeps waiting", async () => {
    for (const state of ["suspended", "grace"]) {
      const { deps, materialize, attempts } = setup({
        requests: [makeRequest()],
        entitlement: async () => ({ state }),
      });
      const summary = await recoverProjectCreations(deps, { now: NOW });
      expect(summary.waiting).toBe(1);
      expect(materialize).not.toHaveBeenCalled();
      expect(attempts[0]).toMatchObject({
        attemptCount: 1,
        stalledReason: null,
      });
      expect(attempts[0].nextAttemptAt).toBe("2026-11-18T12:05:00.000Z");
    }
  });

  it("abandons unpaid requests after the window without flagging investigation", async () => {
    const { deps, attempts } = setup({
      requests: [
        makeRequest({
          createdAt: sqliteTime(RECOVERY_ABANDON_AFTER_MS + 1000),
        }),
      ],
      entitlement: async () => ({ state: "suspended" }),
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = await recoverProjectCreations(deps, { now: NOW });

    expect(summary.abandoned).toBe(1);
    expect(summary.needsInvestigation).toBe(0);
    expect(attempts[0]).toMatchObject({
      stalledReason: "abandoned",
      nextAttemptAt: null,
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("does not abandon requests that show payment evidence", async () => {
    const old = sqliteTime(RECOVERY_ABANDON_AFTER_MS + 1000);
    for (const request of [
      makeRequest({ createdAt: old }),
      makeRequest({ createdAt: old, paymentEvidence: true }),
    ]) {
      const { deps, attempts } = setup({
        requests: [request],
        entitlement: async () => ({
          state: request.paymentEvidence ? "suspended" : "grace",
        }),
      });
      const summary = await recoverProjectCreations(deps, { now: NOW });
      expect(summary.abandoned).toBe(0);
      expect(attempts[0].stalledReason).toBeNull();
    }
  });

  it("remembers payment evidence observed in grace across later attempts", async () => {
    const { deps, attempts } = setup({
      requests: [makeRequest()],
      entitlement: async () => ({ state: "grace" }),
    });

    await recoverProjectCreations(deps, { now: NOW });

    expect(attempts[0].paymentEvidence).toBe(true);
  });

  it("flags investigation when a request with payment evidence never becomes active", async () => {
    const { deps, attempts } = setup({
      requests: [
        makeRequest({
          createdAt: sqliteTime(RECOVERY_MAX_UNVERIFIED_AGE_MS + 1000),
        }),
      ],
      entitlement: async () => ({ state: "grace" }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = await recoverProjectCreations(deps, { now: NOW });

    expect(summary.needsInvestigation).toBe(1);
    expect(attempts[0].stalledReason).toBe("entitlement_unconfirmed");
  });

  it("retries with backoff on a transient entitlement failure", async () => {
    const { deps, attempts, materialize } = setup({
      requests: [makeRequest({ attemptCount: 2 })],
      entitlement: async () => {
        throw new Error("cp down");
      },
    });

    const summary = await recoverProjectCreations(deps, { now: NOW });

    expect(summary.retryScheduled).toBe(1);
    expect(materialize).not.toHaveBeenCalled();
    expect(attempts[0]).toMatchObject({
      attemptCount: 3,
      stalledReason: null,
      nextAttemptAt: "2026-11-18T12:20:00.000Z",
    });
  });

  it("flags investigation when the entitlement stays unverifiable too long", async () => {
    const { deps, attempts } = setup({
      requests: [
        makeRequest({
          createdAt: sqliteTime(RECOVERY_MAX_UNVERIFIED_AGE_MS + 1000),
        }),
      ],
      entitlement: async () => {
        throw new Error("cp down");
      },
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const summary = await recoverProjectCreations(deps, { now: NOW });

    expect(summary.needsInvestigation).toBe(1);
    expect(attempts[0]).toMatchObject({
      stalledReason: "entitlement_unconfirmed",
      nextAttemptAt: null,
    });
    expect(error).toHaveBeenCalledWith(
      "billing.creation.needs_investigation",
      expect.objectContaining({ projectId: "p1", purchaserUserId: "u1" }),
    );
  });

  it("retries a DB failure, then flags investigation at the failure limit", async () => {
    const first = setup({
      requests: [makeRequest()],
      entitlement: async () => ({ state: "active" }),
      materializeOk: false,
    });
    const summary = await recoverProjectCreations(first.deps, { now: NOW });
    expect(summary.retryScheduled).toBe(1);
    expect(first.attempts[0].stalledReason).toBeNull();

    const last = setup({
      requests: [
        makeRequest({
          materializeFailureCount: RECOVERY_MAX_MATERIALIZE_FAILURES - 1,
        }),
      ],
      entitlement: async () => ({ state: "active" }),
      materializeOk: false,
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const limited = await recoverProjectCreations(last.deps, { now: NOW });
    expect(limited.needsInvestigation).toBe(1);
    expect(last.attempts[0]).toMatchObject({
      stalledReason: "creation_failed",
      nextAttemptAt: null,
    });
    expect(error).toHaveBeenCalled();
  });

  it("does not spend the materialize retry budget on polling attempts", async () => {
    const { deps, attempts } = setup({
      requests: [makeRequest({ attemptCount: 30 })],
      entitlement: async () => ({ state: "active" }),
      materializeOk: false,
    });

    await recoverProjectCreations(deps, { now: NOW });

    expect(attempts[0]).toMatchObject({
      stalledReason: null,
      materializeFailureCount: 1,
    });
  });

  it("isolates a failing request from the rest of the batch", async () => {
    const { deps, materialize } = setup({
      requests: [
        makeRequest({ projectId: "a" }),
        makeRequest({ projectId: "b" }),
      ],
      entitlement: async () => ({ state: "active" }),
    });
    materialize.mockResolvedValueOnce(
      err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR),
    );

    const summary = await recoverProjectCreations(deps, { now: NOW });

    expect(summary.created).toBe(1);
    expect(summary.retryScheduled).toBe(1);
  });

  it("throws when the pending list cannot be read so the caller can log it", async () => {
    const { deps } = setup({
      requests: [],
      entitlement: async () => ({ state: "active" }),
    });
    vi.mocked(deps.requests.listRecoverable).mockResolvedValueOnce(
      err(PROJECT_CREATION_REQUEST_REPOSITORY_ERROR),
    );

    await expect(recoverProjectCreations(deps, { now: NOW })).rejects.toThrow();
  });
});
