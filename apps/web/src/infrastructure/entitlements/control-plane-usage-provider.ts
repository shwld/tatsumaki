import { z } from "zod";
import type { ProjectUsageProvider } from "../../application/ports/project-usage-provider";
import {
  PROJECT_USAGE_DEADLINE_REASONS,
  type ProjectUsage,
} from "../../domain/entities/project-usage";
import type { ControlPlaneRpc } from "./control-plane-entitlement-provider";

const answerSchema = z.object({
  projectId: z.string().min(1),
  allowed: z.boolean(),
  revision: z.number().int().positive(),
  cache: z.object({
    maxAgeSeconds: z.number().int().nonnegative(),
    staleIfErrorSeconds: z.number().int().nonnegative(),
  }),
});

const usageSchema = z.union([
  answerSchema.extend({ until: z.null(), untilReason: z.null() }),
  answerSchema.extend({
    until: z.iso.datetime(),
    untilReason: z.enum(PROJECT_USAGE_DEADLINE_REASONS),
  }),
]);

export class ControlPlaneUsageProvider implements ProjectUsageProvider {
  constructor(
    private readonly controlPlane: Pick<ControlPlaneRpc, "getProjectUsage">,
  ) {}

  async getProjectUsage(projectId: string): Promise<ProjectUsage> {
    const usage = usageSchema.parse(
      await this.controlPlane.getProjectUsage({ projectId }),
    );
    if (usage.projectId !== projectId) {
      throw new Error("Control Plane returned a different project");
    }
    return usage;
  }
}
