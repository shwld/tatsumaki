import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError } from "../lib/api-error";
import type { OwnedProjectUsageList } from "../../application/usecases/list-owned-project-usage";

export type ProjectOperationsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; list: OwnedProjectUsageList };

/** Usage and available operations of the projects the current user owns. */
export function useProjectOperations(enabled = true): {
  state: ProjectOperationsState;
  reload: () => void;
} {
  const { i18n } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const [state, setState] = useState<ProjectOperationsState>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  const locale = i18n.language === "en" ? "en" : "ja";
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let ignore = false;
    const run = async () => {
      // 再取得中も直前の一覧を残し、操作の失敗の案内が消えないようにする。
      setState((current) =>
        current.status === "ready" ? current : { status: "loading" },
      );
      try {
        const response = await fetch(`/api/usage/operations?locale=${locale}`);
        if (ignore) return;
        if (!response.ok) {
          if (isAuthError(response.status)) {
            notifySessionExpired();
            return;
          }
          setState({ status: "error" });
          return;
        }
        const list = (await response.json()) as OwnedProjectUsageList;
        if (ignore) return;
        setState(
          Array.isArray(list.projects)
            ? { status: "ready", list }
            : { status: "error" },
        );
      } catch {
        if (!ignore) setState({ status: "error" });
      }
    };
    void run();
    return () => {
      ignore = true;
    };
  }, [enabled, locale, notifySessionExpired, attempt]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [reload]);

  return { state, reload };
}
