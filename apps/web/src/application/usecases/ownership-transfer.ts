import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import { isSubscriptionEnded } from "../../domain/entities/subscription-lifecycle";
import type { ProjectDeletionRequestRepository } from "../../domain/repositories/project-deletion-request-repository";
import type { ProjectRepository } from "../../domain/repositories/project-repository";
import {
  OWNERSHIP_TRANSFER_CONFLICT_ERROR,
  type OwnershipTransfer,
  type ProjectOwnershipTransferRepository,
} from "../../domain/repositories/project-ownership-transfer-repository";
import type { ProjectBillingGateway } from "../ports/project-billing-gateway";
import type { ProjectCheckoutGateway } from "../ports/project-checkout-gateway";
import type { TransferCheckoutExpiryGateway } from "../ports/transfer-checkout-expiry-gateway";
import { deterministicRequestId } from "./deterministic-request-id";

export const TRANSFER_NOT_FOUND_ERROR = "TRANSFER_NOT_FOUND_ERROR" as const;
export const TRANSFER_FORBIDDEN_ERROR = "TRANSFER_FORBIDDEN_ERROR" as const;
export const TRANSFER_INVALID_RECIPIENT_ERROR =
  "TRANSFER_INVALID_RECIPIENT_ERROR" as const;
export const TRANSFER_NO_SUBSCRIPTION_ERROR =
  "TRANSFER_NO_SUBSCRIPTION_ERROR" as const;
export const TRANSFER_ALREADY_PENDING_ERROR =
  "TRANSFER_ALREADY_PENDING_ERROR" as const;
export const TRANSFER_NOT_PENDING_ERROR = "TRANSFER_NOT_PENDING_ERROR" as const;
export const TRANSFER_UNAVAILABLE_ERROR = "TRANSFER_UNAVAILABLE_ERROR" as const;
export const TRANSFER_CHECKOUT_DISABLED_ERROR =
  "TRANSFER_CHECKOUT_DISABLED_ERROR" as const;
export const TRANSFER_PAYMENT_CONFIRMED_ERROR =
  "TRANSFER_PAYMENT_CONFIRMED_ERROR" as const;
export const TRANSFER_PROJECT_DELETING_ERROR =
  "TRANSFER_PROJECT_DELETING_ERROR" as const;
export const TRANSFER_ALREADY_SUBSCRIBED_ERROR =
  "TRANSFER_ALREADY_SUBSCRIBED_ERROR" as const;

export type OwnershipTransferError =
  | typeof TRANSFER_NOT_FOUND_ERROR
  | typeof TRANSFER_FORBIDDEN_ERROR
  | typeof TRANSFER_INVALID_RECIPIENT_ERROR
  | typeof TRANSFER_NO_SUBSCRIPTION_ERROR
  | typeof TRANSFER_ALREADY_PENDING_ERROR
  | typeof TRANSFER_NOT_PENDING_ERROR
  | typeof TRANSFER_UNAVAILABLE_ERROR
  | typeof TRANSFER_CHECKOUT_DISABLED_ERROR
  | typeof TRANSFER_ALREADY_SUBSCRIBED_ERROR
  | typeof TRANSFER_PAYMENT_CONFIRMED_ERROR
  | typeof TRANSFER_PROJECT_DELETING_ERROR;

type Deps = {
  projects: Pick<ProjectRepository, "findMember">;
  transfers: ProjectOwnershipTransferRepository;
  /** 申請が終わったとき、受け手の未決済 Checkout を無効にする。 */
  checkoutExpiry?: TransferCheckoutExpiryGateway;
};

export type OwnershipTransferView = {
  id: string;
  fromUserId: string;
  toUserId: string;
  expiresAt: string;
  role: "requester" | "recipient";
  /** 受け手の画面だけ。受け手自身の購読が有効か。確認できなければ null。 */
  recipientSubscribed?: boolean | null;
};

const toView = (
  transfer: OwnershipTransfer,
  userId: string,
): OwnershipTransferView => ({
  id: transfer.id,
  fromUserId: transfer.fromUserId,
  toUserId: transfer.toUserId,
  expiresAt: transfer.expiresAt,
  role: transfer.fromUserId === userId ? "requester" : "recipient",
});

/**
 * 申請後に申請者が owner でなくなった、または受け手がメンバーでなくなった申請は、
 * 当事者の資格を失っているため無効として扱う。
 */
const isStillEligible = async (
  deps: Deps,
  transfer: OwnershipTransfer,
): Promise<boolean> => {
  const [from, to] = await Promise.all([
    deps.projects.findMember(transfer.projectId, transfer.fromUserId),
    deps.projects.findMember(transfer.projectId, transfer.toUserId),
  ]);
  if (from.isErr() || to.isErr()) throw new Error("member lookup failed");
  return from.value?.role === "owner" && to.value !== null;
};

/**
 * 申請の終了後に受け手の未決済 Checkout を無効にする。失敗しても終了は覆さない。
 * 先に確定した決済は、申請IDを持つ購読として切替側が照合する。
 */
const expireRecipientCheckout = async (
  deps: Deps,
  transfer: OwnershipTransfer,
): Promise<void> => {
  if (!deps.checkoutExpiry) return;
  try {
    await deps.checkoutExpiry.expireTransferCheckout({
      billingAccountId: transfer.toUserId,
      projectId: transfer.projectId,
      transferId: transfer.id,
    });
  } catch (error) {
    console.error("Failed to expire transfer checkout", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
  }
};

/** 資格を失った申請を終了させ、後で資格が戻っても復活しないようにする。 */
const voidIfIneligible = async (
  deps: Deps,
  transfer: OwnershipTransfer,
  now: Date,
): Promise<boolean> => {
  if (await isStillEligible(deps, transfer)) return false;
  await deps.transfers.close({ id: transfer.id, status: "cancelled", now });
  await expireRecipientCheckout(deps, transfer);
  return true;
};

/** 現在の購読の支払者かつ owner の本人だけが、同じプロジェクトの既存メンバーへ申請できる。 */
export async function requestOwnershipTransfer(
  deps: Deps & { billing: ProjectBillingGateway },
  input: { userId: string; projectId: string; toUserId: string; now: Date },
): Promise<Result<OwnershipTransferView, OwnershipTransferError>> {
  const member = await deps.projects.findMember(input.projectId, input.userId);
  if (member.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  if (!member.value) return err(TRANSFER_NOT_FOUND_ERROR);
  if (member.value.role !== "owner") return err(TRANSFER_FORBIDDEN_ERROR);

  if (input.toUserId === input.userId) {
    return err(TRANSFER_INVALID_RECIPIENT_ERROR);
  }
  const recipient = await deps.projects.findMember(
    input.projectId,
    input.toUserId,
  );
  if (recipient.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  if (!recipient.value) return err(TRANSFER_INVALID_RECIPIENT_ERROR);

  try {
    const entry = (
      await deps.billing.listProjectBilling({
        billingAccountId: input.userId,
        projectIds: [input.projectId],
      })
    ).find((billing) => billing.projectId === input.projectId);
    if (!entry) return err(TRANSFER_UNAVAILABLE_ERROR);
    if (
      !entry.subscription ||
      isSubscriptionEnded(entry.subscription.lifecycle)
    ) {
      return err(TRANSFER_NO_SUBSCRIPTION_ERROR);
    }

    const create = () =>
      deps.transfers.create({
        projectId: input.projectId,
        fromUserId: input.userId,
        toUserId: input.toUserId,
        now: input.now,
      });
    let created = await create();
    if (
      created.isErr() &&
      created.error === OWNERSHIP_TRANSFER_CONFLICT_ERROR
    ) {
      const existing = await deps.transfers.findPending(
        input.projectId,
        input.now,
      );
      if (existing.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
      if (
        existing.value &&
        !(await voidIfIneligible(deps, existing.value, input.now))
      ) {
        return err(TRANSFER_ALREADY_PENDING_ERROR);
      }
      created = await create();
    }
    if (created.isErr()) {
      return err(
        created.error === OWNERSHIP_TRANSFER_CONFLICT_ERROR
          ? TRANSFER_ALREADY_PENDING_ERROR
          : TRANSFER_UNAVAILABLE_ERROR,
      );
    }
    // 課金確認の間に当事者が資格を失った場合、成功を返さない。
    if (await voidIfIneligible(deps, created.value, input.now)) {
      return err(TRANSFER_FORBIDDEN_ERROR);
    }
    return ok(toView(created.value, input.userId));
  } catch {
    return err(TRANSFER_UNAVAILABLE_ERROR);
  }
}

/** 当事者だけが有効な申請を見られる。第三者のメンバーには存在を明かさない。 */
export async function getOwnershipTransfer(
  deps: Deps & { billing?: ProjectBillingGateway },
  input: { userId: string; projectId: string; now: Date },
): Promise<Result<OwnershipTransferView | null, OwnershipTransferError>> {
  const member = await deps.projects.findMember(input.projectId, input.userId);
  if (member.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  if (!member.value) return err(TRANSFER_NOT_FOUND_ERROR);

  const pending = await deps.transfers.findPending(input.projectId, input.now);
  if (pending.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  const transfer = pending.value;
  if (
    !transfer ||
    (transfer.fromUserId !== input.userId && transfer.toUserId !== input.userId)
  ) {
    return ok(null);
  }
  try {
    if (await voidIfIneligible(deps, transfer, input.now)) return ok(null);
  } catch {
    return err(TRANSFER_UNAVAILABLE_ERROR);
  }
  const view = toView(transfer, input.userId);
  if (view.role === "recipient" && deps.billing) {
    view.recipientSubscribed = await hasLiveSubscription(
      deps.billing,
      input.userId,
      input.projectId,
    );
  }
  return ok(view);
}

/** 権利の集約値ではなく、その利用者自身の購読だけを見る。確認できなければ null。 */
const hasLiveSubscription = async (
  billing: ProjectBillingGateway,
  userId: string,
  projectId: string,
): Promise<boolean | null> => {
  try {
    const entry = (
      await billing.listProjectBilling({
        billingAccountId: userId,
        projectIds: [projectId],
      })
    ).find((billing) => billing.projectId === projectId);
    if (!entry) return null;
    return (
      entry.subscription !== null &&
      !isSubscriptionEnded(entry.subscription.lifecycle)
    );
  } catch {
    return null;
  }
};

/** 申請者は取消、受け手は辞退。終わった申請(決済確定後を含む)は操作できない。 */
export async function closeOwnershipTransfer(
  deps: Deps & { billing?: ProjectBillingGateway },
  input: {
    userId: string;
    projectId: string;
    transferId: string;
    as: "requester" | "recipient";
    now: Date;
  },
): Promise<Result<void, OwnershipTransferError>> {
  const member = await deps.projects.findMember(input.projectId, input.userId);
  if (member.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  if (!member.value) return err(TRANSFER_NOT_FOUND_ERROR);

  const pending = await deps.transfers.findPending(input.projectId, input.now);
  if (pending.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  const transfer = pending.value;
  // 画面に表示した申請と別の申請(取消後の再申請など)を、古い画面から閉じさせない。
  if (!transfer || transfer.id !== input.transferId) {
    return err(TRANSFER_NOT_PENDING_ERROR);
  }
  try {
    if (await voidIfIneligible(deps, transfer, input.now)) {
      return err(TRANSFER_NOT_PENDING_ERROR);
    }
  } catch {
    return err(TRANSFER_UNAVAILABLE_ERROR);
  }
  const party =
    input.as === "requester" ? transfer?.fromUserId : transfer?.toUserId;
  if (!transfer || party !== input.userId) {
    const isParty =
      transfer?.fromUserId === input.userId ||
      transfer?.toUserId === input.userId;
    return err(isParty ? TRANSFER_FORBIDDEN_ERROR : TRANSFER_NOT_PENDING_ERROR);
  }
  // 受け手の購読が有効になった後は決済確定済みとして、取消・辞退を受け付けない。
  if (deps.billing) {
    const subscribed = await hasLiveSubscription(
      deps.billing,
      transfer.toUserId,
      transfer.projectId,
    );
    if (subscribed === null) return err(TRANSFER_UNAVAILABLE_ERROR);
    if (subscribed) return err(TRANSFER_PAYMENT_CONFIRMED_ERROR);
  }
  const closed = await deps.transfers.close({
    id: transfer.id,
    status: input.as === "requester" ? "cancelled" : "declined",
    now: input.now,
  });
  if (closed.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  if (!closed.value) return err(TRANSFER_NOT_PENDING_ERROR);
  await expireRecipientCheckout(deps, transfer);
  return ok(undefined);
}

/**
 * 有効な申請の指定受取人だけが、同じプロジェクトを自分の決済アカウントで購読する Checkout を開ける。
 * 現オーナーの購読は触らない。切替と旧購読の解約は後続の処理が行う。
 */
export async function startTransferCheckout(
  deps: Deps & {
    billing: ProjectBillingGateway;
    checkout: ProjectCheckoutGateway;
    projectNames: Pick<ProjectRepository, "findById">;
    deletions: Pick<ProjectDeletionRequestRepository, "findById">;
    clock: () => Date;
  },
  input: {
    userId: string;
    projectId: string;
    transferId: string;
    now: Date;
    successUrl: string;
    cancelUrl: string;
  },
  checkoutEnabled: boolean,
): Promise<Result<{ url: string }, OwnershipTransferError>> {
  const member = await deps.projects.findMember(input.projectId, input.userId);
  if (member.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  if (!member.value) return err(TRANSFER_NOT_FOUND_ERROR);

  const isCurrent = async (
    at: Date,
  ): Promise<Result<OwnershipTransfer | null, OwnershipTransferError>> => {
    const pending = await deps.transfers.findPending(input.projectId, at);
    if (pending.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
    return ok(pending.value?.id === input.transferId ? pending.value : null);
  };

  const current = await isCurrent(input.now);
  if (current.isErr()) return err(current.error);
  const transfer = current.value;
  if (!transfer) return err(TRANSFER_NOT_PENDING_ERROR);
  if (transfer.toUserId !== input.userId) return err(TRANSFER_FORBIDDEN_ERROR);

  try {
    if (await voidIfIneligible(deps, transfer, input.now)) {
      return err(TRANSFER_NOT_PENDING_ERROR);
    }
    if (!checkoutEnabled) return err(TRANSFER_CHECKOUT_DISABLED_ERROR);

    // 削除要求の受付後は購読させない。Control Plane 側の閉鎖が最終防衛線。
    const deletion = await deps.deletions.findById(input.projectId);
    if (deletion.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
    if (deletion.value) return err(TRANSFER_PROJECT_DELETING_ERROR);

    const subscribed = await hasLiveSubscription(
      deps.billing,
      input.userId,
      input.projectId,
    );
    if (subscribed === null) return err(TRANSFER_UNAVAILABLE_ERROR);
    if (subscribed) return err(TRANSFER_ALREADY_SUBSCRIBED_ERROR);

    const project = await deps.projectNames.findById(input.projectId);
    if (project.isErr() || !project.value) {
      return err(TRANSFER_UNAVAILABLE_ERROR);
    }
    const session = await deps.checkout.createProjectCheckout({
      billingAccountId: input.userId,
      projectId: input.projectId,
      projectName: project.value.name,
      transferId: transfer.id,
      requestId: await deterministicRequestId(
        `transfer:${transfer.id}:${input.now.toISOString().slice(0, 10)}`,
      ),
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });

    // 作成の間に取消・辞退・失効が確定した場合、開いた Checkout を残さない。
    const after = await isCurrent(deps.clock());
    if (after.isErr() || !after.value) {
      await expireRecipientCheckout(deps, transfer);
      return err(TRANSFER_NOT_PENDING_ERROR);
    }
    return ok({ url: session.url });
  } catch {
    return err(TRANSFER_UNAVAILABLE_ERROR);
  }
}
