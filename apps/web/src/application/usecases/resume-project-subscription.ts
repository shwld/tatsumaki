import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import type { ProjectDeletionRequestRepository } from "../../domain/repositories/project-deletion-request-repository";
import { isSubscriptionEnded } from "../../domain/entities/subscription-lifecycle";
import type { ProjectRepository } from "../../domain/repositories/project-repository";
import type { EntitlementProvider } from "../ports/entitlement-provider";
import type { ProjectBillingGateway } from "../ports/project-billing-gateway";
import type { ProjectCheckoutGateway } from "../ports/project-checkout-gateway";
import { deterministicRequestId } from "./deterministic-request-id";

export const RESUME_NOT_FOUND_ERROR = "RESUME_NOT_FOUND_ERROR" as const;
export const RESUME_FORBIDDEN_ERROR = "RESUME_FORBIDDEN_ERROR" as const;
export const RESUME_CHECKOUT_DISABLED_ERROR =
  "RESUME_CHECKOUT_DISABLED_ERROR" as const;
export const RESUME_NOT_SUSPENDED_ERROR = "RESUME_NOT_SUSPENDED_ERROR" as const;
export const RESUME_PAYMENT_ACTION_REQUIRED_ERROR =
  "RESUME_PAYMENT_ACTION_REQUIRED_ERROR" as const;
export const RESUME_PROJECT_DELETING_ERROR =
  "RESUME_PROJECT_DELETING_ERROR" as const;
export const RESUME_UNAVAILABLE_ERROR = "RESUME_UNAVAILABLE_ERROR" as const;

export type ResumeProjectSubscriptionError =
  | typeof RESUME_NOT_FOUND_ERROR
  | typeof RESUME_FORBIDDEN_ERROR
  | typeof RESUME_CHECKOUT_DISABLED_ERROR
  | typeof RESUME_NOT_SUSPENDED_ERROR
  | typeof RESUME_PAYMENT_ACTION_REQUIRED_ERROR
  | typeof RESUME_PROJECT_DELETING_ERROR
  | typeof RESUME_UNAVAILABLE_ERROR;

/**
 * 同じ projectId への再購読 Checkout。二重クリック・再試行が同じ Checkout を返すよう、
 * requestId は projectId と UTC 日付から決める。重複購読の最終拒否は Control Plane が行う。
 */
export async function resumeProjectSubscription(
  deps: {
    projects: Pick<ProjectRepository, "findMember" | "findById">;
    deletions: Pick<ProjectDeletionRequestRepository, "findById">;
    entitlements: EntitlementProvider;
    billing: ProjectBillingGateway;
    checkout: ProjectCheckoutGateway;
  },
  input: {
    userId: string;
    projectId: string;
    now: Date;
    successUrl: string;
    cancelUrl: string;
  },
  checkoutEnabled: boolean,
): Promise<Result<{ url: string }, ResumeProjectSubscriptionError>> {
  const member = await deps.projects.findMember(input.projectId, input.userId);
  if (member.isErr()) return err(RESUME_UNAVAILABLE_ERROR);
  if (!member.value) return err(RESUME_NOT_FOUND_ERROR);
  if (member.value.role !== "owner") return err(RESUME_FORBIDDEN_ERROR);

  // 削除要求の受付後は再購読させない。Control Plane 側の閉鎖が最終防衛線。
  const deletion = await deps.deletions.findById(input.projectId);
  if (deletion.isErr()) return err(RESUME_UNAVAILABLE_ERROR);
  if (deletion.value) return err(RESUME_PROJECT_DELETING_ERROR);

  try {
    const { state } = await deps.entitlements.getProjectEntitlement(
      input.projectId,
    );
    if (state !== "suspended") return err(RESUME_NOT_SUSPENDED_ERROR);

    const billing = (
      await deps.billing.listProjectBilling({
        billingAccountId: input.userId,
        projectIds: [input.projectId],
      })
    ).find((entry) => entry.projectId === input.projectId);
    if (!billing) return err(RESUME_UNAVAILABLE_ERROR);
    if (
      billing.subscription &&
      !isSubscriptionEnded(billing.subscription.lifecycle)
    ) {
      return err(RESUME_PAYMENT_ACTION_REQUIRED_ERROR);
    }
    if (!checkoutEnabled) return err(RESUME_CHECKOUT_DISABLED_ERROR);

    const project = await deps.projects.findById(input.projectId);
    if (project.isErr() || !project.value) return err(RESUME_UNAVAILABLE_ERROR);

    const session = await deps.checkout.createProjectCheckout({
      billingAccountId: input.userId,
      projectId: input.projectId,
      projectName: project.value.name,
      requestId: await deterministicRequestId(
        `resume:${input.projectId}:${input.now.toISOString().slice(0, 10)}`,
      ),
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
    return ok({ url: session.url });
  } catch {
    return err(RESUME_UNAVAILABLE_ERROR);
  }
}
