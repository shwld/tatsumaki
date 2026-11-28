import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import { INVALID_PROJECT_NAME_ERROR } from "./create-project";
import type { Project } from "../../domain/entities/project";
import type { ProjectCreationRequestRepository } from "../../domain/repositories/project-creation-request-repository";
import type { ProjectRepository } from "../../domain/repositories/project-repository";
import type { ProjectCreationAcquisition } from "../ports/project-creation-acquisition";
import type {
  ProjectCreationEligibilityGateway,
  ProjectCreationOutcomeGateway,
} from "../ports/project-creation-eligibility";

export const PROJECT_CREATION_REQUEST_NOT_FOUND_ERROR =
  "PROJECT_CREATION_REQUEST_NOT_FOUND_ERROR" as const;
export const PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR =
  "PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR" as const;
export const PROJECT_CREATION_ACQUISITION_UNAVAILABLE_ERROR =
  "PROJECT_CREATION_ACQUISITION_UNAVAILABLE_ERROR" as const;
export const PROJECT_CREATION_FAILED_ERROR =
  "PROJECT_CREATION_FAILED_ERROR" as const;

export type StartProjectCreationError =
  | typeof INVALID_PROJECT_NAME_ERROR
  | typeof PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR
  | typeof PROJECT_CREATION_ACQUISITION_UNAVAILABLE_ERROR
  | typeof PROJECT_CREATION_FAILED_ERROR;

export type StartProjectCreationResult =
  | { kind: "redirect"; projectId: string; url: string }
  | { kind: "ready"; projectId: string };

type StartDeps = {
  requests: ProjectCreationRequestRepository;
  eligibility: ProjectCreationEligibilityGateway;
  acquisition: ProjectCreationAcquisition;
};

export async function startProjectCreation(
  deps: StartDeps,
  input: {
    userId: string;
    name: string;
    idempotencyKey: string;
    successUrl: (projectId: string) => string;
    cancelUrl: string;
  },
): Promise<Result<StartProjectCreationResult, StartProjectCreationError>> {
  const name = input.name.trim();
  if (!name) {
    return err(INVALID_PROJECT_NAME_ERROR);
  }

  const opened = await deps.requests.open({
    projectId: ulid(),
    acquisitionRequestId: crypto.randomUUID(),
    requesterUserId: input.userId,
    name,
    idempotencyKey: input.idempotencyKey,
  });
  if (opened.isErr()) {
    return err(PROJECT_CREATION_FAILED_ERROR);
  }
  const request = opened.value;
  if (request.status === "created") {
    return ok({ kind: "ready", projectId: request.projectId });
  }
  if (request.stalledReason !== null) return err(PROJECT_CREATION_FAILED_ERROR);

  let eligibility: Awaited<
    ReturnType<ProjectCreationEligibilityGateway["getEligibility"]>
  >;
  try {
    eligibility = await deps.eligibility.getEligibility({
      projectId: request.projectId,
      accountId: request.requesterUserId,
      requestedAt: requestedAt(request.createdAt),
    });
  } catch {
    return err(PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR);
  }
  if (eligibility.status === "allowed")
    return ok({ kind: "ready", projectId: request.projectId });
  if (eligibility.status === "denied") {
    await deps.requests.markFailed(request.projectId, new Date().toISOString());
    return err(PROJECT_CREATION_FAILED_ERROR);
  }

  try {
    const session = await deps.acquisition.start({
      accountId: input.userId,
      projectId: request.projectId,
      requestedAt: requestedAt(request.createdAt),
      projectName: request.name,
      requestId: request.acquisitionRequestId,
      successUrl: input.successUrl(request.projectId),
      cancelUrl: input.cancelUrl,
    });
    return ok({
      kind: "redirect",
      projectId: request.projectId,
      url: session.url,
    });
  } catch {
    return err(PROJECT_CREATION_ACQUISITION_UNAVAILABLE_ERROR);
  }
}

export type CompleteProjectCreationError =
  | typeof PROJECT_CREATION_REQUEST_NOT_FOUND_ERROR
  | typeof PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR
  | typeof PROJECT_CREATION_FAILED_ERROR;

export type CompleteProjectCreationResult =
  | { status: "created"; project: Project }
  | { status: "pending" }
  | { status: "denied" };

export async function completeProjectCreation(
  deps: {
    requests: ProjectCreationRequestRepository;
    projects: Pick<ProjectRepository, "findById" | "findMember">;
    eligibility: ProjectCreationEligibilityGateway;
  },
  input: { userId: string; projectId: string },
): Promise<
  Result<CompleteProjectCreationResult, CompleteProjectCreationError>
> {
  const found = await deps.requests.findById(input.projectId);
  if (found.isErr()) {
    return err(PROJECT_CREATION_FAILED_ERROR);
  }
  const request = found.value;
  if (!request || request.requesterUserId !== input.userId) {
    return err(PROJECT_CREATION_REQUEST_NOT_FOUND_ERROR);
  }

  if (request.status === "created") {
    const [existing, member] = await Promise.all([
      deps.projects.findById(request.projectId),
      deps.projects.findMember(request.projectId, input.userId),
    ]);
    if (existing.isErr() || member.isErr()) {
      return err(PROJECT_CREATION_FAILED_ERROR);
    }
    if (!existing.value || !member.value) {
      return err(PROJECT_CREATION_REQUEST_NOT_FOUND_ERROR);
    }
    return ok({
      status: "created",
      project: { ...existing.value, currentUserRole: member.value.role },
    });
  }

  if (request.stalledReason !== null) return ok({ status: "denied" });

  let eligibility: Awaited<
    ReturnType<ProjectCreationEligibilityGateway["getEligibility"]>
  >;
  try {
    eligibility = await deps.eligibility.getEligibility({
      projectId: request.projectId,
      accountId: request.requesterUserId,
      requestedAt: new Date(
        `${request.createdAt.replace(" ", "T")}Z`,
      ).toISOString(),
    });
  } catch {
    return err(PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR);
  }
  if (eligibility.status === "denied") {
    const failed = await deps.requests.markFailed(
      request.projectId,
      new Date().toISOString(),
    );
    if (failed.isErr() || !failed.value)
      return err(PROJECT_CREATION_FAILED_ERROR);
    return ok({ status: "denied" });
  }
  if (eligibility.status === "pending") return ok({ status: "pending" });

  const materialized = await deps.requests.materialize(request);
  if (materialized.isErr()) {
    return err(PROJECT_CREATION_FAILED_ERROR);
  }
  return ok({ status: "created", project: materialized.value });
}

export const RECOVERY_BATCH_SIZE = 20;
export const RECOVERY_BASE_DELAY_MS = 5 * 60 * 1000;
export const RECOVERY_MAX_DELAY_MS = 6 * 60 * 60 * 1000;
export const RECOVERY_MAX_MATERIALIZE_FAILURES = 10;

export type RecoverProjectCreationsSummary = {
  examined: number;
  created: number;
  waiting: number;
  retryScheduled: number;
  abandoned: number;
};

const requestedAt = (value: string): string =>
  new Date(
    value.includes("T") ? value : `${value.replace(" ", "T")}Z`,
  ).toISOString();

export async function recoverProjectCreations(
  deps: {
    requests: ProjectCreationRequestRepository;
    eligibility: ProjectCreationEligibilityGateway;
  },
  input: { now: Date; limit?: number },
): Promise<RecoverProjectCreationsSummary> {
  const summary: RecoverProjectCreationsSummary = {
    examined: 0,
    created: 0,
    waiting: 0,
    retryScheduled: 0,
    abandoned: 0,
  };
  const listed = await deps.requests.listRecoverable(
    input.now.toISOString(),
    input.limit ?? RECOVERY_BATCH_SIZE,
  );
  if (listed.isErr())
    throw new Error("Failed to list recoverable project creation requests");
  for (const request of listed.value) {
    summary.examined++;
    const attemptCount = request.attemptCount + 1;
    const delay = Math.min(
      RECOVERY_BASE_DELAY_MS * 2 ** Math.max(0, attemptCount - 1),
      RECOVERY_MAX_DELAY_MS,
    );
    const retry = async (
      lastError: string,
      materializeFailureCount = request.materializeFailureCount,
    ) => {
      const recorded = await deps.requests.recordAttempt({
        projectId: request.projectId,
        attemptCount,
        materializeFailureCount,
        stalledReason: null,
        lastError,
        nextAttemptAt: new Date(input.now.getTime() + delay).toISOString(),
      });
      if (recorded.isErr())
        throw new Error("Failed to record project creation attempt");
    };
    try {
      const eligibility = await deps.eligibility.getEligibility({
        projectId: request.projectId,
        accountId: request.requesterUserId,
        requestedAt: requestedAt(request.createdAt),
      });
      if (eligibility.status === "denied") {
        const failed = await deps.requests.markFailed(
          request.projectId,
          input.now.toISOString(),
        );
        if (failed.isErr())
          throw new Error("Failed to record creation outcome");
        if (failed.value) summary.abandoned++;
        continue;
      }
      if (eligibility.status === "pending") {
        await retry("pending");
        summary.waiting++;
        continue;
      }
      const result = await deps.requests.materialize(request);
      if (result.isOk()) {
        summary.created++;
        continue;
      }
      const failures = request.materializeFailureCount + 1;
      if (failures >= RECOVERY_MAX_MATERIALIZE_FAILURES) {
        const failed = await deps.requests.markFailed(
          request.projectId,
          input.now.toISOString(),
        );
        if (failed.isErr())
          throw new Error("Failed to record creation outcome");
        if (failed.value) summary.abandoned++;
      } else {
        await retry("materialize_failed", failures);
        summary.retryScheduled++;
      }
    } catch (error) {
      console.error("Project creation recovery attempt failed", {
        projectId: request.projectId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      try {
        await retry("provider_unavailable");
      } catch {
        /* The request remains recoverable. */
      }
      summary.retryScheduled++;
    }
  }
  return summary;
}

export async function notifyProjectCreationOutcomes(
  deps: {
    requests: ProjectCreationRequestRepository;
    outcomes: ProjectCreationOutcomeGateway;
  },
  limit = 20,
): Promise<void> {
  const listed = await deps.requests.listUnnotified(limit);
  if (listed.isErr())
    throw new Error("Failed to list project creation outcomes");
  for (const outcome of listed.value) {
    try {
      await deps.outcomes.recordOutcome(outcome);
      const marked = await deps.requests.markNotified(outcome.projectId);
      if (marked.isErr())
        throw new Error("Failed to mark creation outcome notified");
    } catch (error) {
      console.error("Project creation outcome notification failed", {
        projectId: outcome.projectId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      await deps.requests.markNotificationAttempt(outcome.projectId);
    }
  }
}
