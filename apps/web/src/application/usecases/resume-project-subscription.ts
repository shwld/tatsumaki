import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import type { ProjectRepository } from "../../domain/repositories/project-repository";
import type { EntitlementProvider } from "../ports/entitlement-provider";
import type { ProjectBillingGateway } from "../ports/project-billing-gateway";
import type { ProjectCheckoutGateway } from "../ports/project-checkout-gateway";

export const RESUME_NOT_FOUND_ERROR = "RESUME_NOT_FOUND_ERROR" as const;
export const RESUME_FORBIDDEN_ERROR = "RESUME_FORBIDDEN_ERROR" as const;
export const RESUME_CHECKOUT_DISABLED_ERROR =
  "RESUME_CHECKOUT_DISABLED_ERROR" as const;
export const RESUME_NOT_SUSPENDED_ERROR = "RESUME_NOT_SUSPENDED_ERROR" as const;
export const RESUME_PAYMENT_ACTION_REQUIRED_ERROR =
  "RESUME_PAYMENT_ACTION_REQUIRED_ERROR" as const;
export const RESUME_UNAVAILABLE_ERROR = "RESUME_UNAVAILABLE_ERROR" as const;

export type ResumeProjectSubscriptionError =
  | typeof RESUME_NOT_FOUND_ERROR
  | typeof RESUME_FORBIDDEN_ERROR
  | typeof RESUME_CHECKOUT_DISABLED_ERROR
  | typeof RESUME_NOT_SUSPENDED_ERROR
  | typeof RESUME_PAYMENT_ACTION_REQUIRED_ERROR
  | typeof RESUME_UNAVAILABLE_ERROR;

// Control Plane の checkoutRefusal と同じ終了状態。ここで live と判れば Checkout を作らず Portal に導く。
const TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "incomplete_expired",
]);

const utcDay = (now: Date) => now.toISOString().slice(0, 10);

/**
 * 同じ projectId への再購読 Checkout。二重クリック・再試行が同じ Checkout を返すよう、
 * requestId は projectId と UTC 日付から決める。重複購読の最終拒否は Control Plane が行う。
 */
export async function resumeProjectSubscription(
  deps: {
    projects: Pick<ProjectRepository, "findMember">;
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
      !TERMINAL_SUBSCRIPTION_STATUSES.has(billing.subscription.status)
    ) {
      return err(RESUME_PAYMENT_ACTION_REQUIRED_ERROR);
    }
    if (!checkoutEnabled) return err(RESUME_CHECKOUT_DISABLED_ERROR);

    const session = await deps.checkout.createProjectCheckout({
      billingAccountId: input.userId,
      projectId: input.projectId,
      requestId: `resume-${utcDay(input.now)}`,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
    return ok({ url: session.url });
  } catch {
    return err(RESUME_UNAVAILABLE_ERROR);
  }
}
