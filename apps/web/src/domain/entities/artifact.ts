export const ARTIFACT_LIMITS = {
  totalBytes: 50 * 1024 * 1024,
  fileBytes: 25 * 1024 * 1024,
  fileCount: 1000,
} as const;

export type Artifact = {
  __typename: "Artifact";
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
  __typename: "ArtifactVersion";
  artifactId: string;
  version: number;
  entrypoint: string;
  treeDigest: string;
  fileCount: number;
  totalBytes: number;
  createdBy: string;
  createdAt: string;
};

export type ArtifactFile = {
  __typename: "ArtifactFile";
  artifactId: string;
  version: number;
  path: string;
  size: number;
  sha256: string;
  contentType: string;
};

export type ArtifactUploadSessionStatus = "pending" | "published" | "expired";

export type ArtifactManifestEntry = {
  path: string;
  size: number;
  sha256: string;
  contentType: string;
};

export type ArtifactUploadSession = {
  __typename: "ArtifactUploadSession";
  id: string;
  projectId: string;
  artifactId: string;
  baseVersion: number | null;
  title: string;
  entrypoint: string;
  treeDigest: string;
  manifest: ArtifactManifestEntry[];
  requestHash: string;
  status: ArtifactUploadSessionStatus;
  idempotencyKey: string;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
};
