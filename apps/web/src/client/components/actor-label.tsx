import { useTranslation } from "react-i18next";

import type { ProjectMemberProfile } from "../types/project";
import { Avatar } from "./avatar";

type ActorLabelProps = {
  member:
    | Pick<ProjectMemberProfile, "displayName" | "avatarUrl" | "gravatarUrl">
    | null
    | undefined;
  actorName: string | null;
};

const OPAQUE_ID_PATTERN =
  /^([a-z0-9_-]+\|.+|[0-9a-f]{8}-[0-9a-f-]{27}|[0-9A-HJKMNP-TV-Z]{26})$/i;

// 旧形式で保存されたメール・プロバイダ接頭辞付き ID・内部 ID は人に読める名前ではないため、未解決扱いにする
function isReadableActorName(actorName: string | null): actorName is string {
  const name = actorName?.trim();
  return (
    Boolean(name) && !name?.includes("@") && !OPAQUE_ID_PATTERN.test(name ?? "")
  );
}

export function ActorLabel({ member, actorName }: ActorLabelProps) {
  const { t } = useTranslation();
  const knownName =
    member?.displayName ??
    (isReadableActorName(actorName) ? actorName.trim() : null);
  const displayName = knownName ?? t("actorLabel.unknownUser");

  return (
    <span className="inline-flex max-w-full items-center gap-2 whitespace-nowrap">
      <Avatar
        displayName={displayName}
        avatarUrl={member?.avatarUrl ?? null}
        gravatarUrl={member?.gravatarUrl ?? null}
        size="sm"
        initials={knownName ? undefined : "?"}
      />
      <span className="truncate">{displayName}</span>
    </span>
  );
}
