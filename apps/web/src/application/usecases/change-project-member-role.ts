import type { Result } from "neverthrow";
import type {
  ProjectMember,
  ProjectMemberRole,
} from "../../domain/entities/project-member";
import type {
  ProjectRepository,
  UpdateMemberRoleError,
} from "../../domain/repositories/project-repository";
import type { TransferCheckoutExpiryGateway } from "../ports/transfer-checkout-expiry-gateway";
import { expireTransferCheckouts } from "./ownership-transfer";

/**
 * ロール変更で当事者が資格を失った譲渡申請は、受け手が開いたままの Checkout も失効させる。
 * 失効はコミット後の後処理で、クライアントが切断しても打ち切られないよう waitUntil に渡す。
 */
export async function changeProjectMemberRole(
  deps: {
    projects: Pick<ProjectRepository, "updateMemberRole">;
    checkoutExpiry?: TransferCheckoutExpiryGateway;
    waitUntil: (task: Promise<void>) => void;
  },
  input: {
    projectId: string;
    userId: string;
    role: ProjectMemberRole;
    now: Date;
  },
): Promise<Result<ProjectMember | null, UpdateMemberRoleError>> {
  const result = await deps.projects.updateMemberRole(input);
  if (result.isOk() && result.value?.voidedTransfers.length) {
    deps.waitUntil(
      expireTransferCheckouts(
        deps.checkoutExpiry,
        result.value.voidedTransfers,
      ),
    );
  }
  return result.map((change) => change?.member ?? null);
}
