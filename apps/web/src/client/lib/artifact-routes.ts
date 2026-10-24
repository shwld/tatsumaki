export function projectArtifactsPath(projectId: string): string {
  return `/projects/${projectId}/artifacts`;
}

export function artifactPath(projectId: string, artifactId: string): string {
  return `${projectArtifactsPath(projectId)}/${artifactId}`;
}

export function artifactVersionPath(
  projectId: string,
  artifactId: string,
  version: number,
): string {
  return `${artifactPath(projectId, artifactId)}/versions/${version}`;
}

export function artifactsApiPath(projectId: string): string {
  return `/api/projects/${projectId}/artifacts`;
}

export function artifactApiPath(projectId: string, artifactId: string): string {
  return `${artifactsApiPath(projectId)}/${artifactId}`;
}

export function artifactVersionApiPath(
  projectId: string,
  artifactId: string,
  version: number,
): string {
  return `${artifactApiPath(projectId, artifactId)}/versions/${version}`;
}
