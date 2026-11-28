import type { ProjectDeletionNotificationGateway } from "../../application/ports/project-deletion-notification-gateway";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";

export class ControlPlaneProjectDeletionNotificationGateway
  implements ProjectDeletionNotificationGateway
{
  constructor(
    private readonly controlPlane: Pick<
      ControlPlaneRpc,
      "recordProjectDeleted"
    >,
  ) {}
  async recordProjectDeleted(input: { projectId: string }): Promise<void> {
    await this.controlPlane.recordProjectDeleted(input);
  }
}
