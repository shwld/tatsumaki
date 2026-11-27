import type { ProjectCreationAcquisition } from "../../application/ports/project-creation-acquisition";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";
import { parseSessionResponse } from "./session-response";

export class ControlPlaneCreationAcquisition
  implements ProjectCreationAcquisition
{
  constructor(
    private readonly rpc: Pick<ControlPlaneRpc, "startCreationAcquisition">,
  ) {}
  async start(
    input: Parameters<ProjectCreationAcquisition["start"]>[0],
  ): Promise<{ url: string }> {
    return parseSessionResponse(await this.rpc.startCreationAcquisition(input));
  }
}
