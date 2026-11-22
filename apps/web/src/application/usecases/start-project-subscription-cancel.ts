import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import { isSubscriptionEnded } from "../../domain/entities/subscription-lifecycle";
import type { ProjectRepository } from "../../domain/repositories/project-repository";
import type { ProjectBillingGateway } from "../ports/project-billing-gateway";
import type { ProjectSubscriptionCancelGateway } from "../ports/project-subscription-cancel-gateway";

export const CANCEL_NOT_FOUND_ERROR = "CANCEL_NOT_FOUND_ERROR" as const;
export const CANCEL_FORBIDDEN_ERROR = "CANCEL_FORBIDDEN_ERROR" as const;
export const CANCEL_NO_SUBSCRIPTION_ERROR =
  "CANCEL_NO_SUBSCRIPTION_ERROR" as const;
export const CANCEL_ALREADY_SCHEDULED_ERROR =
  "CANCEL_ALREADY_SCHEDULED_ERROR" as const;
export const CANCEL_UNAVAILABLE_ERROR = "CANCEL_UNAVAILABLE_ERROR" as const;

export type StartProjectSubscriptionCancelError =
  | typeof CANCEL_NOT_FOUND_ERROR
  | typeof CANCEL_FORBIDDEN_ERROR
  | typeof CANCEL_NO_SUBSCRIPTION_ERROR
  | typeof CANCEL_ALREADY_SCHEDULED_ERROR
  | typeof CANCEL_UNAVAILABLE_ERROR;

/**
 * 一覧で選んだプロジェクトの購読だけを期間末解約する確認画面へ導く。
 * 決済事業者側の ID はクライアントから受け取らず、Control Plane が billing account と
 * projectId から解決する。ここでは権限と、再操作しても安全な状態かだけを確かめる。
 */
export async function startProjectSubscriptionCancel(
  deps: {
    projects: Pick<ProjectRepository, "findMember">;
    billing: ProjectBillingGateway;
    cancel: ProjectSubscriptionCancelGateway;
  },
  input: { userId: string; projectId: string; returnUrl: string },
): Promise<Result<{ url: string }, StartProjectSubscriptionCancelError>> {
  const member = await deps.projects.findMember(input.projectId, input.userId);
  if (member.isErr()) return err(CANCEL_UNAVAILABLE_ERROR);
  if (!member.value) return err(CANCEL_NOT_FOUND_ERROR);
  if (member.value.role !== "owner") return err(CANCEL_FORBIDDEN_ERROR);

  try {
    const billing = (
      await deps.billing.listProjectBilling({
        billingAccountId: input.userId,
        projectIds: [input.projectId],
      })
    ).find((entry) => entry.projectId === input.projectId);
    if (!billing) return err(CANCEL_UNAVAILABLE_ERROR);
    const { subscription } = billing;
    if (!subscription || isSubscriptionEnded(subscription.lifecycle)) {
      return err(CANCEL_NO_SUBSCRIPTION_ERROR);
    }
    if (subscription.endsAt !== null)
      return err(CANCEL_ALREADY_SCHEDULED_ERROR);

    const session = await deps.cancel.createCancelSession({
      billingAccountId: input.userId,
      projectId: input.projectId,
      returnUrl: input.returnUrl,
    });
    return ok({ url: session.url });
  } catch {
    return err(CANCEL_UNAVAILABLE_ERROR);
  }
}
