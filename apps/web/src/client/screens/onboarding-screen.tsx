import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { TurnstileWidget } from "../components/turnstile-widget";
import { SUPPORTED_LANGUAGES } from "../i18n/config";
import type { OnboardingState } from "../types/onboarding";

const ONBOARDING_ACTION = "onboarding";

type OnboardingScreenProps = {
  state: OnboardingState;
  onCompleted: () => void;
};

export function OnboardingScreen({
  state,
  onCompleted,
}: OnboardingScreenProps) {
  const { t, i18n } = useTranslation();
  const [widgetAttempt, setWidgetAttempt] = useState(0);
  const [widgetFailed, setWidgetFailed] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const challengeEnabled = state.challenge.kind === "enabled";
  const challengeUnavailable = state.challenge.kind === "unavailable";
  const canSubmit =
    acceptedTerms &&
    !submitting &&
    !challengeUnavailable &&
    (!challengeEnabled || token !== null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptedTerms, turnstileToken: token ?? "" }),
      });
      if (response.ok) {
        onCompleted();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as {
        code?: string;
      };
      setToken(null);
      setError(
        body.code === "CHALLENGE_FAILED"
          ? t("onboardingScreen.challengeFailed")
          : body.code === "TERMS_NOT_ACCEPTED"
            ? t("onboardingScreen.termsRequired")
            : body.code === "ONBOARDING_UNAVAILABLE"
              ? t("onboardingScreen.unavailable")
              : t("onboardingScreen.submitError"),
      );
    } catch {
      setToken(null);
      setError(t("onboardingScreen.submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="flex justify-end gap-3 text-xs">
          {SUPPORTED_LANGUAGES.map((language) => (
            <button
              key={language}
              type="button"
              aria-pressed={i18n.language === language}
              className={
                i18n.language === language
                  ? "font-semibold text-gray-900"
                  : "text-blue-700 hover:underline"
              }
              onClick={() => void i18n.changeLanguage(language)}
            >
              {language === "ja" ? "日本語" : "English"}
            </button>
          ))}
        </div>
        <h1 className="text-xl font-semibold text-gray-900">
          {t("onboardingScreen.title")}
        </h1>
        <p className="text-sm text-gray-600">
          {t("onboardingScreen.description")}
        </p>
        {state.email ? (
          <p className="text-xs text-gray-500">
            {t("onboardingScreen.account", { email: state.email })}
          </p>
        ) : null}
        {state.challenge.kind === "enabled" ? (
          // Remount after a failed attempt: a Turnstile token is single use.
          <TurnstileWidget
            key={`${widgetAttempt}:${error ?? ""}`}
            siteKey={state.challenge.siteKey}
            action={ONBOARDING_ACTION}
            onToken={setToken}
            onError={() => setWidgetFailed(true)}
          />
        ) : null}
        {widgetFailed ? (
          <div className="space-y-2" role="alert">
            <p className="text-sm text-red-600">
              {t("onboardingScreen.widgetError")}
            </p>
            <button
              type="button"
              className="text-sm font-medium text-blue-700 hover:underline"
              onClick={() => {
                setWidgetFailed(false);
                setWidgetAttempt((attempt) => attempt + 1);
              }}
            >
              {t("onboardingScreen.widgetRetry")}
            </button>
          </div>
        ) : null}
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            className="mt-1"
            checked={acceptedTerms}
            onChange={(event) => setAcceptedTerms(event.target.checked)}
          />
          <span>
            {t("onboardingScreen.terms")}
            {state.termsUrl || state.privacyUrl ? (
              <span className="ml-2 inline-flex gap-3">
                {state.termsUrl ? (
                  <a
                    href={state.termsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 hover:underline"
                  >
                    {t("onboardingScreen.termsLink")}
                  </a>
                ) : null}
                {state.privacyUrl ? (
                  <a
                    href={state.privacyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 hover:underline"
                  >
                    {t("onboardingScreen.privacyLink")}
                  </a>
                ) : null}
              </span>
            ) : null}
          </span>
        </label>
        {challengeUnavailable ? (
          <p className="text-sm text-red-600" role="alert">
            {t("onboardingScreen.unavailable")}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting
            ? t("onboardingScreen.submitting")
            : t("onboardingScreen.submit")}
        </button>
      </form>
    </main>
  );
}
