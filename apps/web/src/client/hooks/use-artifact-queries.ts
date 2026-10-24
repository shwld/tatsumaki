import { useMutation, useQuery } from "@tanstack/react-query";
import { HttpStatusError } from "../lib/api-error";
import {
  artifactApiPath,
  artifactVersionApiPath,
  artifactsApiPath,
} from "../lib/artifact-routes";
import { parseErrorMessage } from "../lib/parse-error-message";
import type {
  Artifact,
  ArtifactPreviewToken,
  ArtifactVersion,
} from "../types/artifact";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new HttpStatusError(
      await parseErrorMessage(response),
      response.status,
    );
  }
  return (await response.json()) as T;
}

export const artifactQueryKeys = {
  list: (projectId: string) => ["artifacts", projectId] as const,
  detail: (projectId: string, artifactId: string) =>
    ["artifacts", projectId, artifactId] as const,
  versions: (projectId: string, artifactId: string) =>
    ["artifacts", projectId, artifactId, "versions"] as const,
  members: (projectId: string) => ["artifacts", projectId, "members"] as const,
};

export function useArtifactList(projectId: string) {
  return useQuery({
    queryKey: artifactQueryKeys.list(projectId),
    queryFn: () =>
      getJson<{ artifacts: Artifact[] }>(artifactsApiPath(projectId)),
  });
}

export function useArtifactDetail(projectId: string, artifactId: string) {
  return useQuery({
    queryKey: artifactQueryKeys.detail(projectId, artifactId),
    queryFn: () =>
      getJson<{ artifact: Artifact; latestVersion: ArtifactVersion | null }>(
        artifactApiPath(projectId, artifactId),
      ),
  });
}

export function useArtifactVersions(projectId: string, artifactId: string) {
  return useQuery({
    queryKey: artifactQueryKeys.versions(projectId, artifactId),
    queryFn: () =>
      getJson<{ versions: ArtifactVersion[] }>(
        `${artifactApiPath(projectId, artifactId)}/versions`,
      ),
  });
}

/** A failed or missing members list only costs the creator's display name. */
export function useMemberNames(projectId: string) {
  return useQuery({
    queryKey: artifactQueryKeys.members(projectId),
    queryFn: async () => {
      const data = await getJson<{
        members?: { userId: string; displayName?: string }[];
      }>(`/api/projects/${projectId}/members`);
      return new Map(
        (data.members ?? []).flatMap((member) =>
          member.displayName
            ? [[member.userId, member.displayName] as const]
            : [],
        ),
      );
    },
    retry: false,
  });
}

/**
 * A mutation, not a query: a preview token is single-purpose and short-lived,
 * so it must never be cached, shared between components or refetched.
 */
export function useIssuePreviewToken(
  projectId: string,
  artifactId: string,
  version: number,
) {
  return useMutation({
    mutationFn: async (): Promise<ArtifactPreviewToken> => {
      const response = await fetch(
        `${artifactVersionApiPath(projectId, artifactId, version)}/preview-token`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new HttpStatusError(
          await parseErrorMessage(response),
          response.status,
        );
      }
      const body = (await response.json()) as ArtifactPreviewToken;
      return { expiresAt: body.expiresAt, contentPath: body.contentPath };
    },
  });
}
