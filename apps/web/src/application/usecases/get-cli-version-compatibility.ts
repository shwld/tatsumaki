export type CliVersionCompatibility = {
  apiVersion: string;
  minClientVersion: string;
};

const CURRENT_COMPATIBILITY: CliVersionCompatibility = {
  apiVersion: "0.0.9",
  minClientVersion: "0.0.9",
};

export function getCliVersionCompatibility(): CliVersionCompatibility {
  return CURRENT_COMPATIBILITY;
}
