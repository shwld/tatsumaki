import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { projectStoriesPath } from "../lib/story-routes";
import type { Project, ProjectsResponse } from "../types/project";

type ProjectStoryBreadcrumbProps = {
  projectId?: string;
  currentPageLabel: string;
};

const projectNameCache = new Map<string, string>();

export function resetProjectStoryBreadcrumbCacheForTests(): void {
  projectNameCache.clear();
}

function findProjectName(
  projectId: string,
  payload: ProjectsResponse,
): string | null {
  if (!Array.isArray(payload.projects)) {
    return null;
  }

  const project = payload.projects.find((item): item is Project => {
    return item.id === projectId;
  });

  return project?.name ?? null;
}

export function ProjectStoryBreadcrumb({
  projectId,
  currentPageLabel,
}: ProjectStoryBreadcrumbProps) {
  const { t } = useTranslation();
  const fallbackProjectName = t("projectStoryBreadcrumb.fallbackProjectName");
  const [projectName, setProjectName] = useState(fallbackProjectName);

  useEffect(() => {
    let ignore = false;

    const loadProjectName = async () => {
      if (!projectId) {
        setProjectName(fallbackProjectName);
        return;
      }

      setProjectName(fallbackProjectName);

      const cachedName = projectNameCache.get(projectId);
      if (cachedName) {
        setProjectName(cachedName);
        return;
      }

      try {
        const response = await fetch("/api/projects");
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as ProjectsResponse;
        const name = findProjectName(projectId, data);
        if (!ignore && name) {
          projectNameCache.set(projectId, name);
          setProjectName(name);
        }
      } catch {
        // The main screen handles request failures; the breadcrumb can fall back.
      }
    };

    void loadProjectName();

    return () => {
      ignore = true;
    };
  }, [fallbackProjectName, projectId]);

  return (
    <nav
      aria-label={t("projectStoryBreadcrumb.navigationLabel")}
      className="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-600"
    >
      <Link className="font-medium text-blue-700" to="/projects">
        {t("projectStoryBreadcrumb.projectsLink")}
      </Link>
      <span aria-hidden="true">/</span>
      {projectId ? (
        <Link
          className="font-medium text-blue-700"
          to={projectStoriesPath(projectId)}
        >
          {projectName}
        </Link>
      ) : (
        <span>{projectName}</span>
      )}
      <span aria-hidden="true">/</span>
      <span className="text-gray-900">{currentPageLabel}</span>
    </nav>
  );
}
