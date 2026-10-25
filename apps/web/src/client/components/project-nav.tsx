import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useMatch } from "react-router";
import { useBreakpoint } from "../hooks/use-breakpoint";
import { projectArtifactsPath } from "../lib/artifact-routes";
import {
  projectHistoryPath,
  projectMembersPath,
  projectSettingsPath,
  projectStoriesPath,
  projectVelocityDashboardPath,
} from "../lib/story-routes";
import type { ProjectsResponse } from "../types/project";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const projectNameCache = new Map<string, string>();

export function resetProjectNavCacheForTests(): void {
  projectNameCache.clear();
}

function useProjectName(projectId: string, pathname: string): string | null {
  const [name, setName] = useState<string | null>(
    projectNameCache.get(projectId) ?? null,
  );

  useEffect(() => {
    setName(projectNameCache.get(projectId) ?? null);
    let ignore = false;
    const load = async () => {
      try {
        const response = await fetch("/api/projects");
        if (!response.ok) return;
        const data = (await response.json()) as ProjectsResponse;
        const found = Array.isArray(data.projects)
          ? data.projects.find((item) => item.id === projectId)?.name
          : undefined;
        if (!ignore && found) {
          projectNameCache.set(projectId, found);
          setName(found);
        }
      } catch {
        // 名前取得に失敗してもメニュー自体は使えるようフォールバック名を表示する
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [projectId, pathname]);

  return name;
}

export function ProjectNav() {
  const match = useMatch("/projects/:projectId/*");
  const isInvitationAccept = useMatch("/projects/:projectId/invitations/*");
  const projectId = match?.params.projectId;
  if (!projectId || projectId === "new" || isInvitationAccept) return null;
  return <ProjectNavContent projectId={projectId} />;
}

function ProjectNavContent({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const breakpoint = useBreakpoint();
  const projectName = useProjectName(projectId, pathname);
  const [open, setOpen] = useState(false);

  const storiesPath = projectStoriesPath(projectId);
  const items = [
    { to: storiesPath, label: t("projectNav.stories"), prefix: storiesPath },
    {
      to: projectVelocityDashboardPath(projectId),
      label: t("projectNav.velocity"),
    },
    { to: projectHistoryPath(projectId), label: t("projectNav.history") },
    { to: projectArtifactsPath(projectId), label: t("projectNav.artifacts") },
    { to: projectMembersPath(projectId), label: t("projectNav.members") },
    { to: projectSettingsPath(projectId), label: t("projectNav.settings") },
  ].map((item) => {
    const base = item.prefix ?? item.to;
    return {
      ...item,
      current: pathname === base || pathname.startsWith(`${base}/`),
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
          className="min-w-0 truncate text-sm font-medium"
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
        className="max-w-40 shrink-0 truncate text-sm font-semibold"
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
