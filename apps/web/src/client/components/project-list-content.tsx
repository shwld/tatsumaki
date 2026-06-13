import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Project } from "../types/project";
import { ErrorRetry } from "./error-retry";
import { ProjectListItem } from "./project-list-item";

type ProjectListContentProps = {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  onRetry?: () => Promise<void>;
};

export function ProjectListContent({
  projects,
  isLoading,
  error,
  onRetry,
}: ProjectListContentProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <p className="mt-4 text-gray-600">{t("projectListContent.loading")}</p>
    );
  }

  if (error) {
    return onRetry ? (
      <ErrorRetry message={error} onRetry={onRetry} />
    ) : (
      <p className="mt-4 text-sm text-red-600" role="alert">
        {error}
      </p>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5 text-center sm:p-6">
        <p className="text-base font-medium text-gray-900">
          {t("projectListContent.empty.title")}
        </p>
        <p className="mt-2 text-sm text-gray-600">
          {t("projectListContent.empty.description")}
        </p>
        <Link
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-700 px-4 py-3 text-base font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto"
          to="/projects/new"
        >
          {t("projectListContent.empty.action")}
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-5 space-y-3">
      {projects.map((project) => (
        <ProjectListItem key={project.id} project={project} />
      ))}
    </ul>
  );
}
