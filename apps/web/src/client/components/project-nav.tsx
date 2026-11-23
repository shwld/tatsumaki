import { useState } from "react";
import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { useBreakpoint } from "../hooks/use-breakpoint";
import { projectArtifactsPath } from "../lib/artifact-routes";
import {
  projectEpicsPath,
  projectHistoryPath,
  projectMembersPath,
  projectSettingsPath,
  projectStoriesPath,
  projectStoryMapsPath,
  projectVelocityDashboardPath,
} from "../lib/story-routes";
import { useProjectName } from "../contexts/project-name-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function ProjectNav() {
  const { projectId, name } = useProjectName();
  if (!projectId) return null;
  return <ProjectNavContent projectId={projectId} projectName={name} />;
}

function ProjectNavContent({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string | null;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const breakpoint = useBreakpoint();
  const [open, setOpen] = useState(false);

  const storiesPath = projectStoriesPath(projectId);
  const items = [
    {
      to: storiesPath,
      label: t("projectNav.stories"),
      current:
        pathname === storiesPath ||
        pathname.startsWith(`${storiesPath}/stories`),
    },
    {
      to: projectVelocityDashboardPath(projectId),
      label: t("projectNav.velocity"),
    },
    { to: projectEpicsPath(projectId), label: t("projectNav.epics") },
    {
      to: projectStoryMapsPath(projectId),
      label: t("projectNav.storyMaps"),
    },
    { to: projectHistoryPath(projectId), label: t("projectNav.history") },
    { to: projectArtifactsPath(projectId), label: t("projectNav.artifacts") },
    { to: projectMembersPath(projectId), label: t("projectNav.members") },
    { to: projectSettingsPath(projectId), label: t("projectNav.settings") },
  ].map((item) => {
    return {
      ...item,
      current:
        item.current ??
        (pathname === item.to || pathname.startsWith(`${item.to}/`)),
    };
  });
  const displayName = projectName ?? t("projectNav.fallbackProjectName");

  if (breakpoint !== "lg") {
    return (
      <nav
        aria-label={t("projectNav.label")}
        className="flex min-w-0 shrink items-center gap-2"
      >
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("projectNav.menu")}
              title={t("projectNav.menu")}
              data-testid="project-nav-toggle"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <Menu className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48">
            {items.map((item) => (
              <DropdownMenuItem key={item.to} asChild>
                <Link
                  to={item.to}
                  aria-current={item.current ? "page" : undefined}
                  className={item.current ? "font-semibold" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span
          data-testid="project-nav-name"
          className="w-32 min-w-0 shrink truncate text-sm font-medium"
          title={displayName}
        >
          {displayName}
        </span>
      </nav>
    );
  }

  return (
    <nav
      aria-label={t("projectNav.label")}
      className="flex min-w-0 shrink items-center gap-x-3 overflow-hidden"
    >
      <span
        data-testid="project-nav-name"
        className="w-40 shrink-0 truncate text-sm font-semibold"
        title={displayName}
      >
        {displayName}
      </span>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          aria-current={item.current ? "page" : undefined}
          className={`shrink-0 text-sm font-medium hover:underline ${
            item.current ? "text-[var(--color-text)]" : "text-blue-700"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
