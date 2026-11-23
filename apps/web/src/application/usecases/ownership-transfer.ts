import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import { isSubscriptionEnded } from "../../domain/entities/subscription-lifecycle";
import type { ProjectRepository } from "../../domain/repositories/project-repository";
import {
  OWNERSHIP_TRANSFER_CONFLICT_ERROR,
  type OwnershipTransfer,
  type ProjectOwnershipTransferRepository,
} from "../../domain/repositories/project-ownership-transfer-repository";
import type { ProjectBillingGateway } from "../ports/project-billing-gateway";

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

export type OwnershipTransferError =
  | typeof TRANSFER_NOT_FOUND_ERROR
  | typeof TRANSFER_FORBIDDEN_ERROR
  | typeof TRANSFER_INVALID_RECIPIENT_ERROR
  | typeof TRANSFER_NO_SUBSCRIPTION_ERROR
  | typeof TRANSFER_ALREADY_PENDING_ERROR
  | typeof TRANSFER_NOT_PENDING_ERROR
  | typeof TRANSFER_UNAVAILABLE_ERROR;

type Deps = {
  projects: Pick<ProjectRepository, "findMember">;
  transfers: ProjectOwnershipTransferRepository;
};

export type OwnershipTransferView = {
  id: string;
  fromUserId: string;
  toUserId: string;
  expiresAt: string;
  role: "requester" | "recipient";
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
      if (existing.value && (await isStillEligible(deps, existing.value))) {
        return err(TRANSFER_ALREADY_PENDING_ERROR);
      }
      if (existing.value) {
        await deps.transfers.close({
          id: existing.value.id,
          status: "cancelled",
          now: input.now,
        });
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
    return ok(toView(created.value, input.userId));
  } catch {
    return err(TRANSFER_UNAVAILABLE_ERROR);
  }
}

/** 当事者だけが有効な申請を見られる。第三者のメンバーには存在を明かさない。 */
export async function getOwnershipTransfer(
  deps: Deps,
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
    if (!(await isStillEligible(deps, transfer))) return ok(null);
  } catch {
    return err(TRANSFER_UNAVAILABLE_ERROR);
  }
  return ok(toView(transfer, input.userId));
}

/** 申請者は取消、受け手は辞退。終わった申請(決済確定後を含む)は操作できない。 */
export async function closeOwnershipTransfer(
  deps: Deps,
  input: {
    userId: string;
    projectId: string;
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
  const party =
    input.as === "requester" ? transfer?.fromUserId : transfer?.toUserId;
  if (!transfer || party !== input.userId) {
    const isParty =
      transfer?.fromUserId === input.userId ||
      transfer?.toUserId === input.userId;
    return err(isParty ? TRANSFER_FORBIDDEN_ERROR : TRANSFER_NOT_PENDING_ERROR);
  }
  const closed = await deps.transfers.close({
    id: transfer.id,
    status: input.as === "requester" ? "cancelled" : "declined",
    now: input.now,
  });
  if (closed.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  return closed.value ? ok(undefined) : err(TRANSFER_NOT_PENDING_ERROR);
}
