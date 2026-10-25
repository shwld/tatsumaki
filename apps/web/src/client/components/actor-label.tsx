import { Avatar } from "./avatar";

type ActorLabelProps = {
  displayName: string;
  avatarUrl: string | null;
  gravatarUrl: string | null;
};

export function ActorLabel({
  displayName,
  avatarUrl,
  gravatarUrl,
}: ActorLabelProps) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 whitespace-nowrap">
      <Avatar
        displayName={displayName}
        avatarUrl={avatarUrl}
        gravatarUrl={gravatarUrl}
        size="sm"
      />
      <span className="truncate">{displayName}</span>
    </span>
  );
}
