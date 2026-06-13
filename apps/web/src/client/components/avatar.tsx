import { useState } from "react";

type AvatarProps = {
  displayName: string;
  avatarUrl: string | null;
  gravatarUrl: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASSES = {
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-16 w-16 text-xl",
} as const;

function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return displayName.slice(0, 2).toUpperCase();
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 50%, 45%)`;
}

export function Avatar({
  displayName,
  avatarUrl,
  gravatarUrl,
  size = "md",
  className = "",
}: AvatarProps) {
  const [gravatarFailed, setGravatarFailed] = useState(false);
  const [customFailed, setCustomFailed] = useState(false);

  const sizeClass = SIZE_CLASSES[size];
  const baseClass = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sizeClass} ${className}`;

  const effectiveAvatarUrl = avatarUrl && !customFailed ? avatarUrl : null;
  const effectiveGravatarUrl =
    !effectiveAvatarUrl && !gravatarFailed && gravatarUrl ? gravatarUrl : null;
  const showInitials = !effectiveAvatarUrl && !effectiveGravatarUrl;

  if (effectiveAvatarUrl) {
    return (
      <img
        src={effectiveAvatarUrl}
        alt={displayName}
        className={`${baseClass} object-cover`}
        onError={() => setCustomFailed(true)}
      />
    );
  }

  if (effectiveGravatarUrl) {
    return (
      <img
        src={effectiveGravatarUrl}
        alt={displayName}
        className={`${baseClass} object-cover`}
        onError={() => setGravatarFailed(true)}
      />
    );
  }

  if (showInitials) {
    return (
      <span
        className={baseClass}
        style={{ backgroundColor: stringToColor(displayName) }}
        aria-label={displayName}
      >
        <span className="font-medium text-white">
          {getInitials(displayName)}
        </span>
      </span>
    );
  }

  return null;
}
