import { Link } from "react-router";
import { useTranslation } from "react-i18next";

type PermissionDeniedProps = {
  message?: string;
  nextAction?: string;
  retryHint?: string;
  onRetry?: () => void;
  retryLabel?: string;
  backTo?: string;
  backLabel?: string;
};

export function PermissionDenied({
  message,
  nextAction,
  retryHint,
  onRetry,
  retryLabel,
  backTo = "/projects",
  backLabel,
}: PermissionDeniedProps) {
  const { t } = useTranslation();
  const resolvedMessage = message ?? t("permissionDenied.defaultMessage");
  const resolvedNextAction =
    nextAction ?? t("permissionDenied.defaultNextAction");
  const resolvedRetryHint = retryHint ?? t("permissionDenied.defaultRetryHint");
  const resolvedRetryLabel = retryLabel ?? t("permissionDenied.retry");
  const resolvedBackLabel = backLabel ?? t("permissionDenied.backToProjects");

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          {t("permissionDenied.status")}
        </span>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">
          {t("permissionDenied.title")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-700">
          {resolvedMessage}
        </p>
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            {t("permissionDenied.nextActionTitle")}
          </p>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            {resolvedNextAction}
          </p>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            {resolvedRetryHint}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {onRetry ? (
            <button
              type="button"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto"
              onClick={onRetry}
            >
              {resolvedRetryLabel}
            </button>
          ) : null}
          <Link
            to={backTo}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 sm:w-auto"
          >
            {resolvedBackLabel}
          </Link>
        </div>
      </div>
    </main>
  );
}
