export type ProjectEntitlementState = "active" | "grace" | "suspended";

export type ProjectEntitlement = {
  projectId: string;
  state: ProjectEntitlementState;
  validUntil: string | null;
  revision: number;
  cache: {
    maxAgeSeconds: number;
    staleIfErrorSeconds: number;
  };
};
