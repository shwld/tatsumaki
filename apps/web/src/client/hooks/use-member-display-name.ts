import { useTranslation } from "react-i18next";

import type { ProjectMemberProfile } from "../types/project";

export function useMemberDisplayName(): (
  member: Pick<ProjectMemberProfile, "displayName">,
) => string {
  const { t } = useTranslation();
  return (member) => member.displayName ?? t("actorLabel.unknownUser");
}
