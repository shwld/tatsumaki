import { z } from "zod";
import type { ProjectCreationEligibilityGateway } from "../../application/ports/project-creation-eligibility";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";

const responseSchema = z.discriminatedUnion("status", [
  z.object({ projectId: z.string().min(1), status: z.literal("allowed") }),
  z.object({
    projectId: z.string().min(1),
    status: z.literal("pending"),
    deadline: z.iso.datetime(),
  }),
  z.object({ projectId: z.string().min(1), status: z.literal("denied") }),
]);

export class ControlPlaneCreationEligibility
  implements ProjectCreationEligibilityGateway
{
  constructor(
    private readonly controlPlane: Pick<
      ControlPlaneRpc,
      "getCreationEligibility" | "recordProjectCreationOutcome"
    >,
  ) {}

  async getEligibility(
    input: Parameters<ProjectCreationEligibilityGateway["getEligibility"]>[0],
  ) {
    const response = responseSchema.parse(
      await this.controlPlane.getCreationEligibility(input),
    );
    if (response.projectId !== input.projectId)
      throw new Error("Control Plane returned a different project");
    return response;
  }
  async recordOutcome(
    input: import("../../domain/repositories/project-creation-request-repository").ProjectCreationOutcome,
  ): Promise<void> {
    await this.controlPlane.recordProjectCreationOutcome(input);
  }
}
