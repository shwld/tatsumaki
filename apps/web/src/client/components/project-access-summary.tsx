import { useTranslation } from "react-i18next";
import { formatDeadline } from "../lib/format-deadline";
import type { ProjectAccessState } from "../../domain/entities/project-usage";

export function ProjectAccessSummary({
  access,
}: {
  access: ProjectAccessState;
}) {
  const { t, i18n } = useTranslation();
  if (access.kind === "limited") {
    return (
      <>
        <p>
          {t("projectUsage.state.limited", {
            until: formatDeadline(access.until, i18n.language),
          })}
        </p>
        <p className="text-gray-600">
          {t(`projectUsage.deadline.${access.untilReason}`)}
        </p>
      </>
    );
  }
  return (
    <p>
      {t(
        `projectUsage.state.${access.kind === "read_only" ? "readOnly" : access.kind}`,
      )}
    </p>
  );
}
