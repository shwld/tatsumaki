import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError } from "../lib/api-error";
import { OwnedProjectSubscriptions } from "./owned-project-subscriptions";

type BillingInfo = {
  mode: "control-plane" | "self-hosted";
};

type LoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | ({ status: "ready" } & BillingInfo);

export function BillingStatusSection() {
  const { t } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          setState({ status: "unavailable" });
          return;
        }
        const data = (await response.json()) as { mode?: string };
        setState(
          data.mode === "control-plane" || data.mode === "self-hosted"
            ? { status: "ready", mode: data.mode }
            : { status: "unavailable" },
        );
      } catch {
        if (!ignore) setState({ status: "unavailable" });
      }
    };
    void run();
    return () => {
      ignore = true;
    };
  }, [notifySessionExpired]);

  const openPortal = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    let navigating = false;
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
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
      navigating = true;
      window.location.assign(data.url);
    } catch {
      setError(t("billingStatusSection.actions.error"));
    } finally {
      if (!navigating) setPending(false);
    }
  };

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
      ) : state.mode === "self-hosted" ? (
        <p className="text-sm text-gray-600">
          {t("billingStatusSection.guidance.selfHosted")}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            {t("billingStatusSection.guidance.perProject")}
          </p>
          <p className="text-sm text-gray-600">
            {t("billingStatusSection.portalScope")}
          </p>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            onClick={() => void openPortal()}
          >
            {t("billingStatusSection.actions.manage")}
          </button>
          <OwnedProjectSubscriptions />
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
