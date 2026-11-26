import { useEffect, useState } from "react";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError } from "../lib/api-error";

export type UsageMode =
  | "loading"
  | "unavailable"
  | "control-plane"
  | "self-hosted";

/** Whether this deployment restricts usage at all. Self-hosted ones never do. */
export function useUsageMode(): UsageMode {
  const { notifySessionExpired } = useAuthError();
  const [mode, setMode] = useState<UsageMode>("loading");

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      try {
        const response = await fetch("/api/billing/entitlement");
        if (ignore) return;
        if (!response.ok) {
          if (isAuthError(response.status)) {
            notifySessionExpired();
            return;
          }
          setMode("unavailable");
          return;
        }
        const data = (await response.json()) as { mode?: string };
        if (ignore) return;
        setMode(
          data.mode === "control-plane" || data.mode === "self-hosted"
            ? data.mode
            : "unavailable",
        );
      } catch {
        if (!ignore) setMode("unavailable");
      }
    };
    void run();
    return () => {
      ignore = true;
    };
  }, [notifySessionExpired]);

  return mode;
}
