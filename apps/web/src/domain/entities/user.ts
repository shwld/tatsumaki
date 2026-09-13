export type User = {
  __typename: "User";
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  accessStatus: "allowed" | "pending";
  createdAt: string;
  updatedAt: string;
};
