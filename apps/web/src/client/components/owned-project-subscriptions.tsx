import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError } from "../lib/api-error";

type NextBilling =
  | { status: "scheduled"; date: string; amount: number; currency: string }
  | { status: "none" }
  | { status: "unavailable" };

type ProjectSubscription = {
  projectId: string;
  projectName: string;
  entitlementState: "active" | "grace" | "suspended";
  subscription: {
    status: string;
    endsAt: string | null;
    nextBilling: NextBilling;
  } | null;
};

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; projects: ProjectSubscription[] };

const formatDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    new Date(iso),
  );

const formatAmount = (minor: number, currency: string, locale: string) => {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  return formatter.format(minor / 10 ** digits);
};

const TERMINAL_STATUSES = new Set(["canceled", "incomplete_expired"]);

export function OwnedProjectSubscriptions() {
  const { t, i18n } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState<{
    projectId: string;
    kind: "error" | "stale";
  } | null>(null);
  const [searchParams] = useSearchParams();
  const returnedFromCancel = searchParams.get("billing") === "cancel";

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      setState({ status: "loading" });
      try {
        const response = await fetch("/api/billing/subscriptions");
        if (ignore) return;
        if (!response.ok) {
          if (isAuthError(response.status)) {
            notifySessionExpired();
            return;
          }
          setState({ status: "error" });
          return;
        }
        const data = (await response.json()) as {
          projects?: ProjectSubscription[];
        };
        setState(
          Array.isArray(data.projects)
            ? { status: "ready", projects: data.projects }
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
  }, [notifySessionExpired, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [reload]);
  const locale = i18n.language;

  const cancel = async (projectId: string) => {
    setCancelingId(projectId);
    setCancelNotice(null);
    try {
      const response = await fetch(
        `/api/billing/projects/${encodeURIComponent(projectId)}/cancel`,
        { method: "POST" },
      );
      if (isAuthError(response.status)) {
        notifySessionExpired();
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        code?: string;
      };
      if (response.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      if (
        data.code === "no_subscription" ||
        data.code === "already_scheduled"
      ) {
        setCancelNotice({ projectId, kind: "stale" });
        reload();
      } else {
        setCancelNotice({ projectId, kind: "error" });
      }
    } catch {
      setCancelNotice({ projectId, kind: "error" });
    } finally {
      setCancelingId(null);
    }
  };

  const nextBillingText = (nextBilling: NextBilling) => {
    if (nextBilling.status === "scheduled") {
      return `${formatDate(nextBilling.date, locale)} / ${formatAmount(
        nextBilling.amount,
        nextBilling.currency,
        locale,
      )}`;
    }
    return nextBilling.status === "none"
      ? t("billingStatusSection.subscriptions.nextBillingNone")
      : t("billingStatusSection.subscriptions.nextBillingUnavailable");
  };

  return (
    <div className="space-y-2" data-testid="owned-project-subscriptions">
      <h3 className="text-sm font-semibold text-gray-900">
        {t("billingStatusSection.subscriptions.title")}
      </h3>
      {returnedFromCancel ? (
        <p className="text-sm text-gray-600" role="status">
          {t("billingStatusSection.subscriptions.cancel.returned")}
        </p>
      ) : null}
      {state.status === "loading" ? (
        <p className="text-sm text-gray-600">
          {t("billingStatusSection.subscriptions.loading")}
        </p>
      ) : state.status === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600" role="alert">
            {t("billingStatusSection.subscriptions.error")}
          </p>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            onClick={reload}
          >
            {t("billingStatusSection.subscriptions.retry")}
          </button>
        </div>
      ) : state.projects.length === 0 ? (
        <p className="text-sm text-gray-600">
          {t("billingStatusSection.subscriptions.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {state.projects.map((project) => (
            <li
              key={project.projectId}
              className="space-y-1 px-4 py-3 text-sm text-gray-700"
            >
              <p className="font-medium text-gray-900">{project.projectName}</p>
              <p>
                {t(
                  `billingStatusSection.subscriptions.state.${project.entitlementState}`,
                )}
              </p>
              {project.subscription === null ? (
                <p>{t("billingStatusSection.subscriptions.noSubscription")}</p>
              ) : (
                <>
                  <p>
                    {t("billingStatusSection.subscriptions.nextBilling")}:{" "}
                    {nextBillingText(project.subscription.nextBilling)}
                  </p>
                  {project.subscription.endsAt ? (
                    <p>
                      {t("billingStatusSection.subscriptions.endsAt")}:{" "}
                      {formatDate(project.subscription.endsAt, locale)}
                    </p>
                  ) : null}
                  {!TERMINAL_STATUSES.has(project.subscription.status) &&
                  project.subscription.endsAt === null ? (
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={cancelingId !== null}
                      aria-label={t(
                        "billingStatusSection.subscriptions.cancel.buttonFor",
                        { name: project.projectName },
                      )}
                      onClick={() => void cancel(project.projectId)}
                    >
                      {t("billingStatusSection.subscriptions.cancel.button")}
                    </button>
                  ) : null}
                </>
              )}
              {cancelNotice?.projectId === project.projectId ? (
                <p className="text-red-600" role="alert">
                  {t(
                    `billingStatusSection.subscriptions.cancel.${cancelNotice.kind}`,
                  )}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
