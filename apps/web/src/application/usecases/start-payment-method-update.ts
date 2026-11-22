import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import type { ProjectRepository } from "../../domain/repositories/project-repository";
import type { ProjectBillingGateway } from "../ports/project-billing-gateway";
import type { ProjectPaymentMethodGateway } from "../ports/project-payment-method-gateway";

export const PAYMENT_METHOD_NOT_FOUND_ERROR =
  "PAYMENT_METHOD_NOT_FOUND_ERROR" as const;
export const PAYMENT_METHOD_FORBIDDEN_ERROR =
  "PAYMENT_METHOD_FORBIDDEN_ERROR" as const;
export const PAYMENT_METHOD_NO_SUBSCRIPTION_ERROR =
  "PAYMENT_METHOD_NO_SUBSCRIPTION_ERROR" as const;
export const PAYMENT_METHOD_UNAVAILABLE_ERROR =
  "PAYMENT_METHOD_UNAVAILABLE_ERROR" as const;

export type StartPaymentMethodUpdateError =
  | typeof PAYMENT_METHOD_NOT_FOUND_ERROR
  | typeof PAYMENT_METHOD_FORBIDDEN_ERROR
  | typeof PAYMENT_METHOD_NO_SUBSCRIPTION_ERROR
  | typeof PAYMENT_METHOD_UNAVAILABLE_ERROR;

const TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "incomplete_expired",
]);

/**
 * 支払い方法は顧客（ユーザー）単位で、所有する全プロジェクトの購読に共通する。
 * それでも入口は projectId で owner 権限と購読の存在を確かめ、課金の無いプロジェクトからは開けない。
 */
export async function startPaymentMethodUpdate(
  deps: {
    projects: Pick<ProjectRepository, "findMember">;
    billing: ProjectBillingGateway;
    paymentMethod: ProjectPaymentMethodGateway;
  },
  input: { userId: string; projectId: string; returnUrl: string },
): Promise<Result<{ url: string }, StartPaymentMethodUpdateError>> {
  const member = await deps.projects.findMember(input.projectId, input.userId);
  if (member.isErr()) return err(PAYMENT_METHOD_UNAVAILABLE_ERROR);
  if (!member.value) return err(PAYMENT_METHOD_NOT_FOUND_ERROR);
  if (member.value.role !== "owner") return err(PAYMENT_METHOD_FORBIDDEN_ERROR);

  try {
    const billing = (
      await deps.billing.listProjectBilling({
        billingAccountId: input.userId,
        projectIds: [input.projectId],
      })
    ).find((entry) => entry.projectId === input.projectId);
    if (!billing) return err(PAYMENT_METHOD_UNAVAILABLE_ERROR);
    if (
      !billing.subscription ||
      TERMINAL_SUBSCRIPTION_STATUSES.has(billing.subscription.status)
    ) {
      return err(PAYMENT_METHOD_NO_SUBSCRIPTION_ERROR);
    }
    const session = await deps.paymentMethod.createPaymentMethodUpdateSession({
      billingAccountId: input.userId,
      returnUrl: input.returnUrl,
    });
    return ok({ url: session.url });
  } catch {
    return err(PAYMENT_METHOD_UNAVAILABLE_ERROR);
  }
}
