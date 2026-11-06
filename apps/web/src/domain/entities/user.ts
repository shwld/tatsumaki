export type User = {
  __typename: "User";
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  accessStatus: "allowed" | "blocked";
  createdAt: string;
  updatedAt: string;
};
