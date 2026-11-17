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
