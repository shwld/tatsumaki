import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PermissionDenied } from "../components/permission-denied";
import { ProjectListContent } from "../components/project-list-content";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError, isForbiddenError } from "../lib/api-error";
import { parseErrorMessage } from "../lib/parse-error-message";
import { Project, ProjectsResponse } from "../types/project";

export function ProjectListScreen() {
  const { t } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const retryRequestRef = useRef<null | (() => Promise<void>)>(null);

  useEffect(() => {
    let ignore = false;

    const run = async () => {
      retryRequestRef.current = run;
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/projects");
        if (!response.ok) {
          if (!ignore && isAuthError(response.status)) {
            notifySessionExpired();
            return;
          }
          if (!ignore && isForbiddenError(response.status)) {
            setForbidden(await parseErrorMessage(response));
            return;
          }
          setError(await parseErrorMessage(response));
          return;
        }

        const data = (await response.json()) as ProjectsResponse;
        if (!ignore) {
          setProjects(
            Array.isArray(data.projects) ? (data.projects as Project[]) : [],
          );
        }
      } catch {
        if (!ignore) {
          setError(t("projectListScreen.loadError"));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    run();

    return () => {
      ignore = true;
    };
  }, []);

  if (forbidden) {
    return (
      <PermissionDenied
        message={forbidden}
        nextAction={t("projectListScreen.permission.nextAction")}
        retryHint={t("projectListScreen.permission.retryHint")}
        onRetry={() => {
          setForbidden(null);
          void retryRequestRef.current?.();
        }}
        retryLabel={t("projectListScreen.permission.retry")}
        backTo="/projects"
      />
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">
            {t("projectListScreen.title")}
          </h1>
          <Link
            className="text-sm font-medium text-blue-700"
            to="/projects/new"
          >
            + {t("projectListScreen.newProject")}
          </Link>
        </div>
        <ProjectListContent
          projects={projects}
          isLoading={isLoading}
          error={error}
          onRetry={retryRequestRef.current ?? undefined}
        />
      </div>
    </main>
  );
}
