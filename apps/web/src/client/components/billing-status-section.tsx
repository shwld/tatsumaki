import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Entitlement } from "../../domain/entities/entitlement";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError } from "../lib/api-error";

type LoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; entitlement: Entitlement };

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
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      try {
        const response = await fetch("/api/billing/entitlement");
        if (!response.ok) {
          if (!ignore && isAuthError(response.status)) {
            notifySessionExpired();
            return;
          }
          if (!ignore) setState({ status: "unavailable" });
          return;
        }
        const data = (await response.json()) as { entitlement?: Entitlement };
        if (!ignore) {
          setState(
            data.entitlement
              ? { status: "ready", entitlement: data.entitlement }
              : { status: "unavailable" },
          );
        }
      } catch {
        if (!ignore) setState({ status: "unavailable" });
      }
    };
    void run();
    return () => {
      ignore = true;
    };
  }, [notifySessionExpired]);

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
        <BillingStatusDetails
          entitlement={state.entitlement}
          language={i18n.language}
        />
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
