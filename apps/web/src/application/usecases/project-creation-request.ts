import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import { INVALID_PROJECT_NAME_ERROR } from "./create-project";
import type { Project } from "../../domain/entities/project";
import type { ProjectEntitlementState } from "../../domain/entities/entitlement";
import type { ProjectCreationRequestRepository } from "../../domain/repositories/project-creation-request-repository";
import type { ProjectRepository } from "../../domain/repositories/project-repository";
import type { EntitlementProvider } from "../ports/entitlement-provider";
import type { ProjectCheckoutGateway } from "../ports/project-checkout-gateway";

export const PROJECT_CREATION_REQUEST_NOT_FOUND_ERROR =
  "PROJECT_CREATION_REQUEST_NOT_FOUND_ERROR" as const;
export const PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR =
  "PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR" as const;
export const PROJECT_CREATION_CHECKOUT_UNAVAILABLE_ERROR =
  "PROJECT_CREATION_CHECKOUT_UNAVAILABLE_ERROR" as const;
export const PROJECT_CREATION_PAYMENT_PENDING_ERROR =
  "PROJECT_CREATION_PAYMENT_PENDING_ERROR" as const;
export const PROJECT_CREATION_FAILED_ERROR =
  "PROJECT_CREATION_FAILED_ERROR" as const;

export type StartProjectCreationError =
  | typeof INVALID_PROJECT_NAME_ERROR
  | typeof PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR
  | typeof PROJECT_CREATION_CHECKOUT_UNAVAILABLE_ERROR
  | typeof PROJECT_CREATION_PAYMENT_PENDING_ERROR
  | typeof PROJECT_CREATION_FAILED_ERROR;

export type StartProjectCreationResult =
  | { kind: "checkout"; projectId: string; url: string }
  | { kind: "ready"; projectId: string };

type StartDeps = {
  requests: ProjectCreationRequestRepository;
  entitlements: EntitlementProvider;
  checkout: ProjectCheckoutGateway;
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
    checkoutRequestId: crypto.randomUUID(),
    purchaserUserId: input.userId,
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

  let state: ProjectEntitlementState;
  try {
    state = (await deps.entitlements.getProjectEntitlement(request.projectId))
      .state;
  } catch {
    return err(PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR);
  }
  if (state === "active") {
    return ok({ kind: "ready", projectId: request.projectId });
  }
  if (state === "grace") {
    return err(PROJECT_CREATION_PAYMENT_PENDING_ERROR);
  }

  try {
    const session = await deps.checkout.createProjectCheckout({
      billingAccountId: input.userId,
      projectId: request.projectId,
      requestId: request.checkoutRequestId,
      successUrl: input.successUrl(request.projectId),
      cancelUrl: input.cancelUrl,
    });
    return ok({
      kind: "checkout",
      projectId: request.projectId,
      url: session.url,
    });
  } catch {
    return err(PROJECT_CREATION_CHECKOUT_UNAVAILABLE_ERROR);
  }
}

export type CompleteProjectCreationError =
  | typeof PROJECT_CREATION_REQUEST_NOT_FOUND_ERROR
  | typeof PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR
  | typeof PROJECT_CREATION_FAILED_ERROR;

export type CompleteProjectCreationResult =
  | { status: "created"; project: Project }
  | { status: "pending"; state: ProjectEntitlementState };

export async function completeProjectCreation(
  deps: {
    requests: ProjectCreationRequestRepository;
    projects: Pick<ProjectRepository, "findById" | "findMember">;
    entitlements: EntitlementProvider;
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
  if (!request || request.purchaserUserId !== input.userId) {
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

  let state: ProjectEntitlementState;
  try {
    state = (await deps.entitlements.getProjectEntitlement(request.projectId))
      .state;
  } catch {
    return err(PROJECT_CREATION_ENTITLEMENT_UNAVAILABLE_ERROR);
  }
  if (state !== "active") {
    return ok({ status: "pending", state });
  }

  const materialized = await deps.requests.materialize(request);
  if (materialized.isErr()) {
    return err(PROJECT_CREATION_FAILED_ERROR);
  }
  return ok({ status: "created", project: materialized.value });
}

export const RECOVERY_BATCH_SIZE = 20;
export const RECOVERY_BASE_DELAY_MS = 5 * 60 * 1000;
export const RECOVERY_MAX_DELAY_MS = 6 * 60 * 60 * 1000;
// Checkout セッションの有効期限(24h)を十分に超えても支払われない要求は放棄とみなす。
export const RECOVERY_ABANDON_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
export const RECOVERY_MAX_MATERIALIZE_FAILURES = 10;
// 権利を確認できないまま放置しない上限。超えたら支払い済みの可能性として調査対象にする。
export const RECOVERY_MAX_UNVERIFIED_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type RecoverProjectCreationsSummary = {
  examined: number;
  created: number;
  waiting: number;
  retryScheduled: number;
  abandoned: number;
  needsInvestigation: number;
};

const parseSqliteTimestamp = (value: string): number =>
  new Date(`${value.replace(" ", "T")}Z`).getTime();

const backoffDelayMs = (attemptCount: number): number =>
  Math.min(
    RECOVERY_BASE_DELAY_MS * 2 ** Math.max(0, attemptCount - 1),
    RECOVERY_MAX_DELAY_MS,
  );

/**
 * Never throws. 成功画面の complete と同じ冪等な materialize を使うため、並行・再実行でも本体は 1 つ。
 * 返金の実行は自動化しない(needsInvestigation を運用者が調べる)。
 */
export async function recoverProjectCreations(
  deps: {
    requests: ProjectCreationRequestRepository;
    entitlements: EntitlementProvider;
  },
  input: { now: Date; limit?: number },
): Promise<RecoverProjectCreationsSummary> {
  const summary: RecoverProjectCreationsSummary = {
    examined: 0,
    created: 0,
    waiting: 0,
    retryScheduled: 0,
    abandoned: 0,
    needsInvestigation: 0,
  };
  const nowMs = input.now.getTime();
  const listed = await deps.requests.listRecoverable(
    input.now.toISOString(),
    input.limit ?? RECOVERY_BATCH_SIZE,
  );
  if (listed.isErr()) {
    throw new Error("Failed to list recoverable project creation requests");
  }

  for (const request of listed.value) {
    summary.examined += 1;
    const attemptCount = request.attemptCount + 1;
    const ageMs = nowMs - parseSqliteTimestamp(request.createdAt);
    let paymentEvidence = request.paymentEvidence;
    const retryAt = () => new Date(nowMs + backoffDelayMs(attemptCount));

    const settle = async (
      outcome: Pick<
        Parameters<ProjectCreationRequestRepository["recordAttempt"]>[0],
        "stalledReason" | "lastError"
      > & { retry: boolean; materializeFailureCount?: number },
    ) => {
      const recorded = await deps.requests.recordAttempt({
        projectId: request.projectId,
        attemptCount,
        materializeFailureCount:
          outcome.materializeFailureCount ?? request.materializeFailureCount,
        paymentEvidence,
        nextAttemptAt: outcome.retry ? retryAt().toISOString() : null,
        lastError: outcome.lastError,
        stalledReason: outcome.stalledReason,
      });
      if (recorded.isErr()) {
        console.error("Failed to record project creation attempt", {
          projectId: request.projectId,
        });
      }
    };

    let state: ProjectEntitlementState;
    try {
      state = (await deps.entitlements.getProjectEntitlement(request.projectId))
        .state;
    } catch {
      if (ageMs > RECOVERY_MAX_UNVERIFIED_AGE_MS) {
        summary.needsInvestigation += 1;
        console.error("billing.creation.needs_investigation", {
          projectId: request.projectId,
          purchaserUserId: request.purchaserUserId,
          reason: "entitlement_unconfirmed",
          attemptCount,
        });
        await settle({
          retry: false,
          stalledReason: "entitlement_unconfirmed",
          lastError: "entitlement_unavailable",
        });
      } else {
        summary.retryScheduled += 1;
        await settle({
          retry: true,
          stalledReason: null,
          lastError: "entitlement_unavailable",
        });
      }
      continue;
    }

    if (state !== "active") {
      if (state === "grace") paymentEvidence = true;
      const hasPaymentEvidence = paymentEvidence;
      if (!hasPaymentEvidence && ageMs > RECOVERY_ABANDON_AFTER_MS) {
        summary.abandoned += 1;
        await settle({
          retry: false,
          stalledReason: "abandoned",
          lastError: `entitlement_${state}`,
        });
      } else if (hasPaymentEvidence && ageMs > RECOVERY_MAX_UNVERIFIED_AGE_MS) {
        summary.needsInvestigation += 1;
        console.error("billing.creation.needs_investigation", {
          projectId: request.projectId,
          purchaserUserId: request.purchaserUserId,
          reason: "entitlement_unconfirmed",
          attemptCount,
        });
        await settle({
          retry: false,
          stalledReason: "entitlement_unconfirmed",
          lastError: `entitlement_${state}`,
        });
      } else {
        summary.waiting += 1;
        await settle({
          retry: true,
          stalledReason: null,
          lastError: `entitlement_${state}`,
        });
      }
      continue;
    }

    const materialized = await deps.requests.materialize(request);
    if (materialized.isOk()) {
      summary.created += 1;
      continue;
    }
    paymentEvidence = true;
    const materializeFailures = request.materializeFailureCount + 1;
    if (materializeFailures >= RECOVERY_MAX_MATERIALIZE_FAILURES) {
      summary.needsInvestigation += 1;
      console.error("billing.creation.needs_investigation", {
        projectId: request.projectId,
        purchaserUserId: request.purchaserUserId,
        reason: "creation_failed",
        attemptCount,
      });
      await settle({
        retry: false,
        stalledReason: "creation_failed",
        lastError: "materialize_failed",
        materializeFailureCount: materializeFailures,
      });
    } else {
      summary.retryScheduled += 1;
      await settle({
        retry: true,
        stalledReason: null,
        lastError: "materialize_failed",
        materializeFailureCount: materializeFailures,
      });
    }
  }
  return summary;
}
