import { z } from "zod";
import type {
  ProjectOperationsGateway,
  ProjectOperationsList,
} from "../../application/ports/project-operations-gateway";
import {
  ACCOUNT_OPERATIONS,
  PROJECT_OPERATIONS,
} from "../../domain/entities/project-operation";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";
import { httpsUrlSchema } from "./https-url";
import { parseSessionResponse } from "./session-response";

const listSchema = z.object({
  accountOperations: z.array(z.enum(ACCOUNT_OPERATIONS)),
  projects: z.array(
    z.object({
      projectId: z.string().min(1),
      operations: z.array(z.enum(PROJECT_OPERATIONS)),
      notice: z
        .object({ text: z.string().min(1), url: httpsUrlSchema })
        .nullable(),
    }),
  ),
});

export class ControlPlaneOperationsGateway implements ProjectOperationsGateway {
  constructor(
    private readonly controlPlane: Pick<
      ControlPlaneRpc,
      | "listProjectOperations"
      | "startProjectOperation"
      | "startAccountOperation"
    >,
  ) {}

  async listProjectOperations(
    input: Parameters<ProjectOperationsGateway["listProjectOperations"]>[0],
  ): Promise<ProjectOperationsList> {
    const list = listSchema.parse(
      await this.controlPlane.listProjectOperations(input),
    );
    const requested = new Set(input.projectIds);
    if (list.projects.some((project) => !requested.has(project.projectId))) {
      throw new Error(
        "Control Plane returned a project that was not requested",
      );
    }
    return list;
  }

  async startProjectOperation(
    input: Parameters<ProjectOperationsGateway["startProjectOperation"]>[0],
  ): Promise<{ url: string }> {
    return parseSessionResponse(
      await this.controlPlane.startProjectOperation(input),
    );
  }

  async startAccountOperation(
    input: Parameters<ProjectOperationsGateway["startAccountOperation"]>[0],
  ): Promise<{ url: string }> {
    return parseSessionResponse(
      await this.controlPlane.startAccountOperation(input),
    );
  }
}
