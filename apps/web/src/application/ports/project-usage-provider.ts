import type { ProjectUsage } from "../../domain/entities/project-usage";

export interface ProjectUsageProvider {
  getProjectUsage(projectId: string): Promise<ProjectUsage>;
}
