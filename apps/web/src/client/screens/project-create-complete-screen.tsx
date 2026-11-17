import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";

import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError } from "../lib/api-error";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15;

type Phase = "waiting" | "delayed" | "grace" | "error" | "notFound";

export function ProjectCreateCompleteScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notifySessionExpired } = useAuthError();
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get("request");
  const [phase, setPhase] = useState<Phase>(requestId ? "waiting" : "notFound");
  const [round, setRound] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const check = useCallback(
    async (attempt: number, isCancelled: () => boolean): Promise<void> => {
      if (!requestId) return;
      try {
        const response = await fetch(
          `/api/project-creation-requests/${encodeURIComponent(requestId)}/complete`,
          { method: "POST" },
        );
        if (isCancelled()) return;
        if (response.status === 404) {
          setPhase("notFound");
          return;
        }
        if (!response.ok) {
          if (isAuthError(response.status)) {
            notifySessionExpired();
            return;
          }
          setPhase("error");
          return;
        }
        const data = (await response.json()) as {
          status?: "created" | "pending";
          state?: string;
          project?: { id: string };
        };
        if (data.status === "created" && data.project) {
          navigate(`/projects/${data.project.id}`, { replace: true });
          return;
        }
        if (attempt + 1 >= POLL_MAX_ATTEMPTS) {
          setPhase(data.state === "grace" ? "grace" : "delayed");
          return;
        }
        timerRef.current = setTimeout(
          () => void check(attempt + 1, isCancelled),
          POLL_INTERVAL_MS,
        );
      } catch {
        if (!isCancelled()) setPhase("error");
      }
    },
    [navigate, notifySessionExpired, requestId],
  );

  useEffect(() => {
    let cancelled = false;
    void check(0, () => cancelled);
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [check, round]);

  const retry = () => {
    setPhase("waiting");
    setRound((value) => value + 1);
  };

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto max-w-xl space-y-4 rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("projectCreateCompleteScreen.title")}
        </h1>
        <p
          className="text-sm text-gray-700"
          role={phase === "waiting" ? "status" : "alert"}
        >
          {t(`projectCreateCompleteScreen.${phase}`)}
        </p>
        {phase === "delayed" || phase === "grace" || phase === "error" ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            onClick={retry}
          >
            {t("projectCreateCompleteScreen.retry")}
          </button>
        ) : null}
        {phase !== "waiting" ? (
          <Link
            className="block text-sm font-medium text-blue-700"
            to="/projects/new"
          >
            {t("projectCreateCompleteScreen.backToCreate")}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
