export type CliVersionCompatibility = {
  apiVersion: string;
  minClientVersion: string;
};

const CURRENT_COMPATIBILITY: CliVersionCompatibility = {
  apiVersion: "0.0.11",
  minClientVersion: "0.0.11",
};

export function getCliVersionCompatibility(): CliVersionCompatibility {
  return CURRENT_COMPATIBILITY;
}
