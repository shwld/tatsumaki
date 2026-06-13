export const API_KEY_SCOPES = ["story:write", "story:read"] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export type ProjectApiKey = {
  __typename: "ProjectApiKey";
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  ownerUserId: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function isValidApiKeyScope(value: unknown): value is ApiKeyScope {
  return (
    typeof value === "string" &&
    (API_KEY_SCOPES as readonly string[]).includes(value)
  );
}
