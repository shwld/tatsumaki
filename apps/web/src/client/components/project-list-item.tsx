import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Project } from "../types/project";
import {
  projectStoriesPath,
  projectVelocityDashboardPath,
} from "../lib/story-routes";

type ProjectListItemProps = {
  project: Project;
};

export function ProjectListItem({ project }: ProjectListItemProps) {
  const { t } = useTranslation();
  const sprintDuration = t("projectListItem.sprintDuration", {
    days: project.sprintDurationDays,
    weeks: project.sprintDurationDays / 7,
  });

  return (
    <li className="rounded-md border border-gray-200 px-4 py-3">
      <p className="font-medium text-gray-900">{project.name}</p>
      <p className="text-sm text-gray-600">
        {t("projectListItem.sprintDurationLabel", {
          duration: sprintDuration,
        })}
      </p>
      {project.currentUserRole ? (
        <p className="mt-1 text-xs text-gray-500">
          {t("projectListItem.currentUserRole", {
            role: project.currentUserRole,
          })}
        </p>
      ) : null}
      <div className="mt-2 flex items-center gap-4">
        <Link
          className="text-sm font-medium text-blue-700"
          to={`/projects/${project.id}/members`}
        >
          {t("projectListItem.members")}
        </Link>
        <Link
          className="text-sm font-medium text-blue-700"
          to={`/projects/${project.id}/settings`}
        >
          {t("projectListItem.settings")}
        </Link>
      </div>
      <div className="mt-2 flex items-center gap-4">
        <Link
          className="text-sm font-medium text-blue-700"
          to={projectStoriesPath(project.id)}
        >
          {t("projectListItem.stories")}
        </Link>
        <Link
          className="text-sm font-medium text-blue-700"
          to={projectVelocityDashboardPath(project.id)}
        >
          {t("projectListItem.velocity")}
        </Link>
      </div>
    </li>
  );
}
