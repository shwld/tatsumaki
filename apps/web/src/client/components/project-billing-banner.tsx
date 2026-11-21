import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useAuthError } from "../contexts/auth-error-context";
import type { ProjectBilling } from "../contexts/project-billing-context";
import { isAuthError } from "../lib/api-error";

const SETTLE_POLL_INTERVAL_MS = 5_000;
const SETTLE_POLL_LIMIT = 24;

const BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-current px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60";

export function ProjectBillingBanner({ billing }: { billing: ProjectBilling }) {
  const { t, i18n } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [resumeNotice, setResumeNotice] = useState<
    "paymentAction" | "checkoutDisabled" | null
  >(null);
  const [searchParams] = useSearchParams();
  const isOwner = billing.role === "owner";
  const returned = searchParams.get("billing");
  const waitingForResume =
    returned === "resume" &&
    (billing.state === "suspended" || billing.state === "loading");
  const [pollCount, setPollCount] = useState(0);
  const { refresh } = billing;

  useEffect(() => {
    if (!waitingForResume || pollCount >= SETTLE_POLL_LIMIT) return;
    const timer = window.setTimeout(() => {
      setPollCount((n) => n + 1);
      refresh();
    }, SETTLE_POLL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [waitingForResume, pollCount, refresh]);

  if (billing.state === "active" || billing.state === "loading") return null;
  if (billing.state === "grace" && !isOwner) return null;

  const openPortal = async () => {
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      if (isAuthError(response.status)) {
        notifySessionExpired();
        return;
      }
      const data = response.ok
        ? ((await response.json()) as { url?: string })
        : {};
      if (!data.url) {
        setError(true);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  const resume = async () => {
    setPending(true);
    setError(false);
    setResumeNotice(null);
    try {
      const response = await fetch(
        `/api/billing/projects/${encodeURIComponent(billing.projectId)}/resume`,
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
      if (data.code === "payment_action_required") {
        setResumeNotice("paymentAction");
      } else if (data.code === "checkout_disabled") {
        setResumeNotice("checkoutDisabled");
      } else if (data.code === "not_suspended") {
        refresh();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  const manageButton = (
    <button
      type="button"
      className={BUTTON_CLASS}
      disabled={pending}
      onClick={() => void openPortal()}
    >
      {t("projectBillingBanner.manage")}
    </button>
  );

  let body: ReactNode;
  if (billing.state === "grace") {
    const until = billing.validUntil
      ? new Intl.DateTimeFormat(i18n.language === "en" ? "en-US" : "ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(billing.validUntil))
      : null;
    body = (
      <>
        <p>
          {until
            ? t("projectBillingBanner.grace.owner", { until })
            : t("projectBillingBanner.grace.ownerNoDate")}
        </p>
        {manageButton}
      </>
    );
  } else if (billing.state === "suspended") {
    body = (
      <>
        <p className="font-semibold">
          {t("projectBillingBanner.suspended.title")}
        </p>
        <p>
          {isOwner
            ? t("projectBillingBanner.suspended.owner")
            : t("projectBillingBanner.suspended.member")}
        </p>
        {isOwner ? (
          <>
            {waitingForResume ? (
              <p role="status">
                {pollCount >= SETTLE_POLL_LIMIT
                  ? t("projectBillingBanner.resume.delayed")
                  : t("projectBillingBanner.resume.waiting")}
              </p>
            ) : returned === "resume-cancel" ? (
              <p>{t("projectBillingBanner.resume.canceled")}</p>
            ) : null}
            {resumeNotice ? (
              <p>{t(`projectBillingBanner.resume.${resumeNotice}`)}</p>
            ) : null}
            {resumeNotice === "checkoutDisabled" ? null : (
              <button
                type="button"
                className={BUTTON_CLASS}
                disabled={pending}
                onClick={() => void resume()}
              >
                {t("projectBillingBanner.resume.button")}
              </button>
            )}
            {manageButton}
          </>
        ) : null}
      </>
    );
  } else {
    body = (
      <>
        <p>{t("projectBillingBanner.unknown.message")}</p>
        <button
          type="button"
          className={BUTTON_CLASS}
          onClick={billing.refresh}
        >
          {t("projectBillingBanner.unknown.retry")}
        </button>
      </>
    );
  }

  return (
    <div
      role="status"
      data-testid="project-billing-banner"
      className="space-y-2 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      {body}
      {error ? (
        <p role="alert" className="text-red-700">
          {t("projectBillingBanner.portalError")}
        </p>
      ) : null}
    </div>
  );
}
