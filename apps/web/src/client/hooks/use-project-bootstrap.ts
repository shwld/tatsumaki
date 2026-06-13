import { useQuery } from "@tanstack/react-query";
import { storyQueryKeys } from "./story-query-keys";
import {
  projectApiPath,
  projectIterationsApiPath,
  projectLabelsApiPath,
} from "../lib/story-routes";
import { parseErrorMessage } from "../lib/parse-error-message";
import type {
  Iteration,
  IterationOverride,
  IterationsResponse,
} from "../types/iteration";
import type { Project } from "../types/project";
import type {
  ProjectLabel,
  ProjectLabelsResponse,
} from "../types/project-label";
import { UNKNOWN_MEMBER_DISPLAY_NAME } from "../../lib/member-display-name";
import type { ProjectMemberProfile } from "../types/project";

type ProjectBootstrapData = {
  project: Project | null;
  iterations: Iteration[];
  iterationOverrides: IterationOverride[];
  velocity: number;
  memberOptions: ProjectMemberProfile[];
  projectLabels: ProjectLabel[];
};
type QueryError = Error & { status?: number };

async function fetchProjectBootstrap(
  projectId: string,
): Promise<ProjectBootstrapData> {
  const [membersResponse, labelsResponse, iterationsResponse, projectResponse] =
    await Promise.all([
      fetch(`/api/projects/${projectId}/members`),
      fetch(projectLabelsApiPath(projectId)),
      fetch(projectIterationsApiPath(projectId)),
      fetch(projectApiPath(projectId)),
    ]);

  for (const response of [
    membersResponse,
    labelsResponse,
    iterationsResponse,
    projectResponse,
  ]) {
    if (!response.ok) {
      const error = new Error(await parseErrorMessage(response)) as QueryError;
      error.status = response.status;
      throw error;
    }
  }

  const membersPayload = (await membersResponse.json()) as {
    members?: Array<{
      userId?: string;
      displayName?: string;
      avatarUrl?: string | null;
      gravatarUrl?: string | null;
    }>;
  };
  const labelsPayload = (await labelsResponse.json()) as ProjectLabelsResponse;
  const iterationsPayload =
    (await iterationsResponse.json()) as IterationsResponse;
  const projectPayload = (await projectResponse.json()) as {
    project?: Project;
  };

  return {
    project: projectPayload.project ?? null,
    iterations: Array.isArray(iterationsPayload.iterations)
      ? iterationsPayload.iterations
      : [],
    iterationOverrides: Array.isArray(iterationsPayload.iterationOverrides)
      ? iterationsPayload.iterationOverrides
      : [],
    velocity: iterationsPayload.velocity ?? 0,
    memberOptions: Array.isArray(membersPayload.members)
      ? membersPayload.members
          .filter((member): member is typeof member & { userId: string } =>
            Boolean(member.userId),
          )
          .map(
            (member): ProjectMemberProfile => ({
              id: member.userId,
              displayName: member.displayName ?? UNKNOWN_MEMBER_DISPLAY_NAME,
              avatarUrl: member.avatarUrl ?? null,
              gravatarUrl: member.gravatarUrl ?? null,
            }),
          )
      : [],
    projectLabels: Array.isArray(labelsPayload.labels)
      ? labelsPayload.labels
      : [],
  };
}

export function useProjectBootstrap(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId
      ? storyQueryKeys.projectBootstrap(projectId)
      : ["projects", "missing", "bootstrap"],
    queryFn: () => {
      if (!projectId) {
        throw new Error("Project not found");
      }
      return fetchProjectBootstrap(projectId);
    },
    enabled: Boolean(projectId),
  });
}
