export const PROJECT_OPERATIONS = [
  "resume",
  "resolve",
  "stop",
  "manage",
] as const;

export type ProjectOperation = (typeof PROJECT_OPERATIONS)[number];

export const ACCOUNT_OPERATIONS = ["manage"] as const;

export type AccountOperation = (typeof ACCOUNT_OPERATIONS)[number];

export const isProjectOperation = (value: string): value is ProjectOperation =>
  (PROJECT_OPERATIONS as readonly string[]).includes(value);
