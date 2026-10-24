export type Artifact = {
  id: string;
  projectId: string;
  title: string;
  archivedAt: string | null;
  latestVersion: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ArtifactVersion = {
  artifactId: string;
  version: number;
  entrypoint: string;
  treeDigest: string;
  fileCount: number;
  totalBytes: number;
  createdBy: string;
  createdAt: string;
};

export type ArtifactPreviewToken = {
  expiresAt: string;
  contentPath: string;
};
