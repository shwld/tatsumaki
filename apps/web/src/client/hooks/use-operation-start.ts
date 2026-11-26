import { useEffect, useState } from "react";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError } from "../lib/api-error";

/** Asks for the destination of an operation and moves there. */
export function useOperationStart(onFailed?: () => void) {
  const { notifySessionExpired } = useAuthError();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const start = async (path: string) => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    let navigating = false;
    try {
      const response = await fetch(path, { method: "POST" });
      if (isAuthError(response.status)) {
        notifySessionExpired();
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
      };
      if (response.ok && data.url) {
        navigating = true;
        window.location.assign(data.url);
        return;
      }
      setFailed(true);
      onFailed?.();
    } catch {
      setFailed(true);
      onFailed?.();
    } finally {
      if (!navigating) setPending(false);
    }
  };

  return { pending, failed, start };
}
