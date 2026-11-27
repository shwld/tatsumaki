import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import type { ProjectDeletionRequestRepository } from "../../domain/repositories/project-deletion-request-repository";
import type { ProjectRepository } from "../../domain/repositories/project-repository";
import {
  OWNERSHIP_TRANSFER_CONFLICT_ERROR,
  type OwnershipTransfer,
  type ProjectOwnershipTransferRepository,
} from "../../domain/repositories/project-ownership-transfer-repository";
import type { OwnershipTransferProvider } from "../ports/ownership-transfer-provider";
import { deterministicRequestId } from "./deterministic-request-id";
import { advanceOwnershipTransfer } from "./advance-ownership-transfer";

export const TRANSFER_NOT_FOUND_ERROR = "TRANSFER_NOT_FOUND_ERROR" as const;
export const TRANSFER_FORBIDDEN_ERROR = "TRANSFER_FORBIDDEN_ERROR" as const;
export const TRANSFER_INVALID_RECIPIENT_ERROR =
  "TRANSFER_INVALID_RECIPIENT_ERROR" as const;
export const TRANSFER_ALREADY_PENDING_ERROR =
  "TRANSFER_ALREADY_PENDING_ERROR" as const;
export const TRANSFER_NOT_PENDING_ERROR = "TRANSFER_NOT_PENDING_ERROR" as const;
export const TRANSFER_UNAVAILABLE_ERROR = "TRANSFER_UNAVAILABLE_ERROR" as const;
export const TRANSFER_CHECKOUT_DISABLED_ERROR =
  "TRANSFER_CHECKOUT_DISABLED_ERROR" as const;
export const TRANSFER_PROJECT_DELETING_ERROR =
  "TRANSFER_PROJECT_DELETING_ERROR" as const;

export type OwnershipTransferError =
  | typeof TRANSFER_NOT_FOUND_ERROR
  | typeof TRANSFER_FORBIDDEN_ERROR
  | typeof TRANSFER_INVALID_RECIPIENT_ERROR
  | typeof TRANSFER_ALREADY_PENDING_ERROR
  | typeof TRANSFER_NOT_PENDING_ERROR
  | typeof TRANSFER_UNAVAILABLE_ERROR
  | typeof TRANSFER_CHECKOUT_DISABLED_ERROR
  | typeof TRANSFER_PROJECT_DELETING_ERROR;

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
  state: "pending" | "completed";
  acquisition?: "available" | "disabled";
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
  state: "pending",
});

const COMPLETED_VISIBLE_MS = 7 * 86_400_000;

const toCompletedView = (
  transfer: OwnershipTransfer,
  userId: string,
  now: Date,
): OwnershipTransferView | null => {
  if (
    transfer.status !== "completed" ||
    (transfer.fromUserId !== userId && transfer.toUserId !== userId)
  )
    return null;
  const endedAt = transfer.endedAt ? new Date(transfer.endedAt).getTime() : 0;
  return now.getTime() - endedAt < COMPLETED_VISIBLE_MS
    ? { ...toView(transfer, userId), state: "completed" }
    : null;
};

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

/** 資格を失った申請を終了させ、後で資格が戻っても復活しないようにする。 */
const voidIfIneligible = async (
  deps: Deps,
  transfer: OwnershipTransfer,
  now: Date,
): Promise<boolean> => {
  if (await isStillEligible(deps, transfer)) return false;
  await deps.transfers.close({ id: transfer.id, status: "cancelled", now });
  return true;
};

export async function requestOwnershipTransfer(
  deps: Deps,
  input: { userId: string; projectId: string; toUserId: string; now: Date },
): Promise<Result<OwnershipTransferView, OwnershipTransferError>> {
  const member = await deps.projects.findMember(input.projectId, input.userId);
  if (member.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  if (!member.value) return err(TRANSFER_NOT_FOUND_ERROR);
  if (member.value.role !== "owner") return err(TRANSFER_FORBIDDEN_ERROR);
  if (input.toUserId === input.userId)
    return err(TRANSFER_INVALID_RECIPIENT_ERROR);
  const recipient = await deps.projects.findMember(
    input.projectId,
    input.toUserId,
  );
  if (recipient.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  if (!recipient.value) return err(TRANSFER_INVALID_RECIPIENT_ERROR);
  try {
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
      )
        return err(TRANSFER_ALREADY_PENDING_ERROR);
      created = await create();
    }
    if (created.isErr())
      return err(
        created.error === OWNERSHIP_TRANSFER_CONFLICT_ERROR
          ? TRANSFER_ALREADY_PENDING_ERROR
          : TRANSFER_UNAVAILABLE_ERROR,
      );
    if (await voidIfIneligible(deps, created.value, input.now))
      return err(TRANSFER_FORBIDDEN_ERROR);
    return ok(toView(created.value, input.userId));
  } catch {
    return err(TRANSFER_UNAVAILABLE_ERROR);
  }
}

export async function getOwnershipTransfer(
  deps: Deps & {
    provider: OwnershipTransferProvider;
    acquisitionAvailable?: boolean;
    deletions: Pick<ProjectDeletionRequestRepository, "findById">;
  },
  input: { userId: string; projectId: string; now: Date },
): Promise<Result<OwnershipTransferView | null, OwnershipTransferError>> {
  const member = await deps.projects.findMember(input.projectId, input.userId);
  if (member.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  if (!member.value) return err(TRANSFER_NOT_FOUND_ERROR);
  const pending = await deps.transfers.findPending(input.projectId, input.now);
  if (pending.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  let transfer = pending.value;
  let progress:
    | "waiting"
    | "blocked"
    | "switched"
    | "not-switched"
    | "unavailable" = "unavailable";
  if (
    transfer &&
    (transfer.fromUserId === input.userId || transfer.toUserId === input.userId)
  ) {
    try {
      if (await voidIfIneligible(deps, transfer, input.now)) transfer = null;
      else {
        progress = await advanceOwnershipTransfer(
          {
            transfers: deps.transfers,
            provider: deps.provider,
            deletions: deps.deletions,
          },
          transfer,
        );
        const refreshed = await deps.transfers.findPending(
          input.projectId,
          input.now,
        );
        if (refreshed.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
        transfer = refreshed.value;
      }
    } catch {
      return err(TRANSFER_UNAVAILABLE_ERROR);
    }
  }
  if (
    !transfer ||
    (transfer.fromUserId !== input.userId && transfer.toUserId !== input.userId)
  ) {
    const latest = await deps.transfers.findLatest(input.projectId);
    if (latest.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
    return ok(
      latest.value
        ? toCompletedView(latest.value, input.userId, input.now)
        : null,
    );
  }
  const view = toView(transfer, input.userId);
  if (view.role === "recipient" && progress === "waiting") {
    view.acquisition = deps.acquisitionAvailable ? "available" : "disabled";
  }
  return ok(view);
}

/** 申請者は取消、受け手は辞退できる。 */
export async function closeOwnershipTransfer(
  deps: Deps,
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
  const closed = await deps.transfers.close({
    id: transfer.id,
    status: input.as === "requester" ? "cancelled" : "declined",
    now: input.now,
  });
  if (closed.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  if (!closed.value) return err(TRANSFER_NOT_PENDING_ERROR);
  return ok(undefined);
}

export async function startTransferCheckout(
  deps: Deps & {
    provider: OwnershipTransferProvider;
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
  enabled: boolean,
): Promise<Result<{ url: string }, OwnershipTransferError>> {
  const member = await deps.projects.findMember(input.projectId, input.userId);
  if (member.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  if (!member.value) return err(TRANSFER_NOT_FOUND_ERROR);
  const current = await deps.transfers.findPending(input.projectId, input.now);
  if (current.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
  const transfer = current.value;
  if (!transfer || transfer.id !== input.transferId)
    return err(TRANSFER_NOT_PENDING_ERROR);
  if (transfer.toUserId !== input.userId) return err(TRANSFER_FORBIDDEN_ERROR);
  try {
    if (await voidIfIneligible(deps, transfer, input.now))
      return err(TRANSFER_NOT_PENDING_ERROR);
    if (!enabled) return err(TRANSFER_CHECKOUT_DISABLED_ERROR);
    const earlier = await deps.transfers.hasUnnotifiedSwitch(input.projectId);
    if (earlier.isErr() || earlier.value)
      return err(TRANSFER_UNAVAILABLE_ERROR);
    const deletion = await deps.deletions.findById(input.projectId);
    if (deletion.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
    if (deletion.value) return err(TRANSFER_PROJECT_DELETING_ERROR);
    const project = await deps.projectNames.findById(input.projectId);
    if (project.isErr() || !project.value)
      return err(TRANSFER_UNAVAILABLE_ERROR);
    const session = await deps.provider.startAcquisition({
      projectId: input.projectId,
      transferId: transfer.id,
      recipientId: input.userId,
      projectName: project.value.name,
      requestId: await deterministicRequestId(`transfer:${transfer.id}`),
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
    const after = await deps.transfers.findPending(
      input.projectId,
      deps.clock(),
    );
    if (after.isErr()) return err(TRANSFER_UNAVAILABLE_ERROR);
    if (
      !after.value ||
      after.value.id !== transfer.id ||
      (await voidIfIneligible(deps, transfer, deps.clock()))
    )
      return err(TRANSFER_NOT_PENDING_ERROR);
    return ok(session);
  } catch {
    return err(TRANSFER_UNAVAILABLE_ERROR);
  }
}
