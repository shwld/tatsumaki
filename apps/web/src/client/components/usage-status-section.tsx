import { useTranslation } from "react-i18next";
import { useUsageMode } from "../hooks/use-usage-mode";
import { OwnedProjectUsage } from "./owned-project-usage";

export function UsageStatusSection() {
  const { t } = useTranslation();
  const mode = useUsageMode();

  return (
    <section
      className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      aria-labelledby="usage-status-title"
    >
      <h2
        id="usage-status-title"
        className="text-lg font-semibold text-gray-900"
      >
        {t("projectUsage.title")}
      </h2>
      {mode === "loading" ? (
        <p className="text-sm text-gray-600">{t("projectUsage.loading")}</p>
      ) : mode === "unavailable" ? (
        <p className="text-sm text-gray-600" role="status">
          {t("projectUsage.modeUnavailable")}
        </p>
      ) : mode === "self-hosted" ? (
        <p className="text-sm text-gray-600">{t("projectUsage.selfHosted")}</p>
      ) : (
        <OwnedProjectUsage />
      )}
    </section>
  );
}
