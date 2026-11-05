import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import type { Entitlement } from "../../domain/entities/entitlement";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError } from "../lib/api-error";

type EntitlementResult = {
  entitlement: Entitlement;
  checkoutEnabled: boolean;
};

type LoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | ({ status: "ready" } & EntitlementResult);

type EntitlementResponse = {
  entitlement?: Entitlement;
  checkoutEnabled?: boolean;
};

const CHECKOUT_POLL_INTERVAL_MS = 2000;
const CHECKOUT_POLL_MAX_ATTEMPTS = 15;

const formatValidUntil = (value: string, language: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(
    date,
  );
};

export function BillingStatusSection() {
  const { t, i18n } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const [searchParams] = useSearchParams();
  const returnedFromCheckout = searchParams.get("checkout") === "success";
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [pollTimedOut, setPollTimedOut] = useState(false);

  const fetchEntitlement = useCallback(async (): Promise<
    EntitlementResult | "unavailable" | "session-expired"
  > => {
    try {
      const response = await fetch("/api/billing/entitlement");
      if (!response.ok) {
        return isAuthError(response.status) ? "session-expired" : "unavailable";
      }
      const data = (await response.json()) as EntitlementResponse;
      return data.entitlement
        ? {
            entitlement: data.entitlement,
            checkoutEnabled: data.checkoutEnabled === true,
          }
        : "unavailable";
    } catch {
      return "unavailable";
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async (attempt: number) => {
      const result = await fetchEntitlement();
      if (ignore) return;
      if (result === "session-expired") {
        notifySessionExpired();
        return;
      }
      const hasNextAttempt =
        returnedFromCheckout && attempt + 1 < CHECKOUT_POLL_MAX_ATTEMPTS;
      if (result === "unavailable") {
        if (hasNextAttempt) {
          timer = setTimeout(
            () => void run(attempt + 1),
            CHECKOUT_POLL_INTERVAL_MS,
          );
          return;
        }
        setPollTimedOut(returnedFromCheckout);
        setState({ status: "unavailable" });
        return;
      }
      setState({ status: "ready", ...result });
      if (!returnedFromCheckout || result.entitlement.plan === "pro") return;
      if (!hasNextAttempt) {
        setPollTimedOut(true);
        return;
      }
      timer = setTimeout(
        () => void run(attempt + 1),
        CHECKOUT_POLL_INTERVAL_MS,
      );
    };

    void run(0);
    return () => {
      ignore = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchEntitlement, notifySessionExpired, returnedFromCheckout]);

  const awaitingCheckout =
    returnedFromCheckout &&
    state.status === "ready" &&
    state.entitlement.plan !== "pro";

  return (
    <section
      className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      aria-labelledby="billing-status-title"
    >
      <h2
        id="billing-status-title"
        className="text-lg font-semibold text-gray-900"
      >
        {t("billingStatusSection.title")}
      </h2>
      {state.status === "loading" ? (
        <p className="text-sm text-gray-600">
          {t("billingStatusSection.loading")}
        </p>
      ) : state.status === "unavailable" ? (
        <p className="text-sm text-gray-600" role="status">
          {t("billingStatusSection.unavailable")}
        </p>
      ) : (
        <>
          {returnedFromCheckout ? (
            <p className="text-sm text-gray-700" role="status">
              {!awaitingCheckout
                ? t("billingStatusSection.checkout.completed")
                : pollTimedOut
                  ? t("billingStatusSection.checkout.delayed")
                  : t("billingStatusSection.checkout.waiting")}
            </p>
          ) : null}
          <BillingStatusDetails
            entitlement={state.entitlement}
            language={i18n.language}
          />
          <BillingActions
            entitlement={state.entitlement}
            checkoutEnabled={state.checkoutEnabled}
          />
        </>
      )}
    </section>
  );
}

function BillingStatusDetails({
  entitlement,
  language,
}: {
  entitlement: Entitlement;
  language: string;
}) {
  const { t } = useTranslation();
  const { plan, state, limits, validUntil } = entitlement;
  const formattedValidUntil = validUntil
    ? formatValidUntil(validUntil, language)
    : null;

  const guidance =
    state === "grace"
      ? formattedValidUntil
        ? t("billingStatusSection.guidance.grace", {
            validUntil: formattedValidUntil,
          })
        : t("billingStatusSection.guidance.graceNoDate")
      : state === "restricted"
        ? t("billingStatusSection.guidance.restricted")
        : plan === "free"
          ? t("billingStatusSection.guidance.freeActive")
          : plan === "pro"
            ? t("billingStatusSection.guidance.proActive")
            : t("billingStatusSection.guidance.unlimitedActive");

  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-gray-500">
          {t("billingStatusSection.plan.label")}
        </dt>
        <dd className="font-medium text-gray-900">
          {t(`billingStatusSection.plan.${plan}`)}
        </dd>
        <dt className="text-gray-500">
          {t("billingStatusSection.state.label")}
        </dt>
        <dd className="font-medium text-gray-900">
          {t(`billingStatusSection.state.${state}`)}
        </dd>
        <dt className="text-gray-500">
          {t("billingStatusSection.maxOwnedProjects.label")}
        </dt>
        <dd className="font-medium text-gray-900">
          {limits.maxOwnedProjects === null
            ? t("billingStatusSection.maxOwnedProjects.unlimited")
            : t("billingStatusSection.maxOwnedProjects.count", {
                count: limits.maxOwnedProjects,
              })}
        </dd>
        {formattedValidUntil ? (
          <>
            <dt className="text-gray-500">
              {t("billingStatusSection.validUntil")}
            </dt>
            <dd className="font-medium text-gray-900">{formattedValidUntil}</dd>
          </>
        ) : null}
      </dl>
      <p className="text-sm text-gray-600">{guidance}</p>
    </>
  );
}

type ActionKind = "checkout" | "portal";

function BillingActions({
  entitlement,
  checkoutEnabled,
}: {
  entitlement: Entitlement;
  checkoutEnabled: boolean;
}) {
  const { t } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const [pending, setPending] = useState<ActionKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { plan, state } = entitlement;
  const canManagePayment = plan === "pro" || state !== "active";
  const canUpgrade = plan === "free" && state === "active";

  const redirectTo = async (kind: ActionKind) => {
    setPending(kind);
    setError(null);
    try {
      const response = await fetch(`/api/billing/${kind}`, { method: "POST" });
      if (!response.ok) {
        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        setError(t("billingStatusSection.actions.error"));
        return;
      }
      const data = (await response.json()) as { url?: string };
      if (!data.url) {
        setError(t("billingStatusSection.actions.error"));
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError(t("billingStatusSection.actions.error"));
    } finally {
      setPending(null);
    }
  };

  const buttonClass =
    "inline-flex min-h-11 items-center justify-center rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

  if (canManagePayment) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          className={buttonClass}
          disabled={pending !== null}
          onClick={() => void redirectTo("portal")}
        >
          {t(
            state === "active"
              ? "billingStatusSection.actions.manage"
              : "billingStatusSection.actions.resume",
          )}
        </button>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (canUpgrade && checkoutEnabled) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          className={buttonClass}
          disabled={pending !== null}
          onClick={() => void redirectTo("checkout")}
        >
          {t("billingStatusSection.actions.upgrade")}
        </button>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (canUpgrade) {
    return (
      <p className="text-sm text-gray-500">
        {t("billingStatusSection.actions.upgradeComingSoon")}
      </p>
    );
  }

  return null;
}
