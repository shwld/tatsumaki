import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError } from "../lib/api-error";
import { ProjectSection } from "./project-section";
import {
  isSubscriptionEnded,
  type SubscriptionLifecycle,
} from "../../domain/entities/subscription-lifecycle";

type NextBilling =
  | { status: "scheduled"; date: string; amount: number; currency: string }
  | { status: "none" }
  | { status: "unavailable" };

type ProjectSubscription = {
  projectId: string;
  entitlementState: "active" | "grace" | "suspended";
  subscription: {
    lifecycle: SubscriptionLifecycle;
    endsAt: string | null;
    nextBilling: NextBilling;
  } | null;
};

type LoadState =
  | { status: "loading" }
  | { status: "hidden" }
  | { status: "error" }
  | { status: "ready"; project: ProjectSubscription | null };

const BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

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

/** owner 専用。セルフホストでは何も描画しない。 */
export function ProjectSubscriptionSection({
  projectId,
}: {
  projectId: string;
}) {
  const { t, i18n } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<"cancel" | "paymentMethod" | null>(
    null,
  );
  const [notice, setNotice] = useState<
    "cancelError" | "stale" | "paymentError" | null
  >(null);
  const [searchParams] = useSearchParams();
  const returned = searchParams.get("billing");
  const locale = i18n.language;

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      setState({ status: "loading" });
      try {
        const entitlement = await fetch("/api/billing/entitlement");
        if (ignore) return;
        if (isAuthError(entitlement.status)) {
          notifySessionExpired();
          return;
        }
        if (!entitlement.ok) {
          setState({ status: "error" });
          return;
        }
        const mode = ((await entitlement.json()) as { mode?: string }).mode;
        if (mode !== "control-plane") {
          setState({ status: "hidden" });
          return;
        }
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
            ? {
                status: "ready",
                project:
                  data.projects.find(
                    (entry) => entry.projectId === projectId,
                  ) ?? null,
              }
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
  }, [notifySessionExpired, projectId, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [reload]);

  const start = async (
    kind: "cancel" | "paymentMethod",
    path: string,
  ): Promise<void> => {
    setPending(kind);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/billing/projects/${encodeURIComponent(projectId)}/${path}`,
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
        setNotice("stale");
        reload();
      } else {
        setNotice(kind === "cancel" ? "cancelError" : "paymentError");
      }
    } catch {
      setNotice(kind === "cancel" ? "cancelError" : "paymentError");
    } finally {
      setPending(null);
    }
  };

  if (state.status === "hidden") return null;

  const nextBillingText = (nextBilling: NextBilling) => {
    if (nextBilling.status === "scheduled") {
      return `${formatDate(nextBilling.date, locale)} / ${formatAmount(
        nextBilling.amount,
        nextBilling.currency,
        locale,
      )}`;
    }
    return nextBilling.status === "none"
      ? t("projectSubscriptionSection.nextBillingNone")
      : t("projectSubscriptionSection.nextBillingUnavailable");
  };

  const project = state.status === "ready" ? state.project : null;
  const subscription = project?.subscription ?? null;
  const live =
    subscription !== null && !isSubscriptionEnded(subscription.lifecycle);

  return (
    <ProjectSection title={t("projectSubscriptionSection.title")}>
      <div className="space-y-2" data-testid="project-subscription-section">
        {returned === "cancel" ? (
          <p className="text-sm text-gray-600" role="status">
            {t("projectSubscriptionSection.cancel.returned")}
          </p>
        ) : null}
        {returned === "payment-method" ? (
          <p className="text-sm text-gray-600" role="status">
            {t("projectSubscriptionSection.paymentMethod.returned")}
          </p>
        ) : null}
        {state.status === "loading" ? (
          <p className="text-sm text-gray-600">
            {t("projectSubscriptionSection.loading")}
          </p>
        ) : state.status === "error" ? (
          <div className="space-y-2">
            <p className="text-sm text-red-600" role="alert">
              {t("projectSubscriptionSection.error")}
            </p>
            <button type="button" className={BUTTON_CLASS} onClick={reload}>
              {t("projectSubscriptionSection.retry")}
            </button>
          </div>
        ) : (
          <div className="space-y-1 text-sm text-gray-700">
            {project ? (
              <p>
                {t(
                  `projectSubscriptionSection.state.${project.entitlementState}`,
                )}
              </p>
            ) : null}
            {subscription === null ? (
              <p>{t("projectSubscriptionSection.noSubscription")}</p>
            ) : (
              <>
                <p>
                  {t("projectSubscriptionSection.nextBilling")}:{" "}
                  {nextBillingText(subscription.nextBilling)}
                </p>
                {subscription.endsAt ? (
                  <p>
                    {t("projectSubscriptionSection.endsAt")}:{" "}
                    {formatDate(subscription.endsAt, locale)}
                  </p>
                ) : null}
              </>
            )}
            {live ? (
              <div className="flex flex-wrap gap-2 pt-2">
                {subscription.endsAt === null ? (
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    disabled={pending !== null}
                    onClick={() => void start("cancel", "cancel?from=settings")}
                  >
                    {t("projectSubscriptionSection.cancel.button")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  disabled={pending !== null}
                  onClick={() => void start("paymentMethod", "payment-method")}
                >
                  {t("projectSubscriptionSection.paymentMethod.button")}
                </button>
              </div>
            ) : null}
            {live ? (
              <p className="text-gray-600">
                {t("projectSubscriptionSection.paymentMethod.scope")}
              </p>
            ) : null}
          </div>
        )}
        {notice ? (
          <p className="text-sm text-red-600" role="alert">
            {notice === "stale"
              ? t("projectSubscriptionSection.cancel.stale")
              : notice === "cancelError"
                ? t("projectSubscriptionSection.cancel.error")
                : t("projectSubscriptionSection.paymentMethod.error")}
          </p>
        ) : null}
      </div>
    </ProjectSection>
  );
}
