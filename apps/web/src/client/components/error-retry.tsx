import { useState } from "react";
import { useTranslation } from "react-i18next";

type ErrorRetryProps = {
  message: string;
  onRetry: () => Promise<void>;
};

export function ErrorRetry({ message, onRetry }: ErrorRetryProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const { t } = useTranslation();

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div
      className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3"
      role="alert"
    >
      <p className="text-sm text-red-700">{message}</p>
      <button
        type="button"
        className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
        onClick={() => {
          void handleRetry();
        }}
        disabled={isRetrying}
      >
        {isRetrying ? t("errorRetry.retrying") : t("errorRetry.retry")}
      </button>
    </div>
  );
}
