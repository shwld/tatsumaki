import type {
  ProjectNameNotification,
  ProjectNameProvider,
} from "../../application/ports/project-name-notifications";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";
export class ControlPlaneProjectNameProvider implements ProjectNameProvider {
  constructor(
    private readonly rpc: Pick<ControlPlaneRpc, "recordProjectRenamed">,
  ) {}
  async recordRenamed(notification: ProjectNameNotification): Promise<void> {
    await this.rpc.recordProjectRenamed(notification);
  }
}
