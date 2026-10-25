import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { useAuthError } from "../contexts/auth-error-context";
import { useArtifactList } from "../hooks/use-artifact-queries";
import { isAuthError, isHttpStatusError } from "../lib/api-error";
import { artifactPath } from "../lib/artifact-routes";

export function ArtifactListScreen() {
  const { t, i18n } = useTranslation();
  const { projectId = "" } = useParams<{ projectId: string }>();
  const { notifySessionExpired } = useAuthError();
  const query = useArtifactList(projectId);

  const sessionExpired =
    isHttpStatusError(query.error) && isAuthError(query.error.status);
  useEffect(() => {
    if (sessionExpired) notifySessionExpired();
  }, [sessionExpired, notifySessionExpired]);

  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">
        {t("artifactScreens.list.title")}
      </h1>
      {query.isPending ? (
        <p role="status" className="text-sm text-gray-600">
          {t("artifactScreens.list.loading")}
        </p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {t("artifactScreens.list.loadError")}
        </p>
      ) : query.data.artifacts.length === 0 ? (
        <p role="status" className="text-sm text-gray-600">
          {t("artifactScreens.list.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {query.data.artifacts.map((artifact) => (
            <li
              key={artifact.id}
              className="rounded-md border border-gray-200 px-4 py-3"
            >
              <Link
                className="font-medium text-blue-700"
                to={artifactPath(projectId, artifact.id)}
              >
                {artifact.title}
              </Link>
              <p className="text-sm text-gray-600">
                {artifact.latestVersion === null
                  ? t("artifactScreens.list.noVersion")
                  : t("artifactScreens.list.latestVersion", {
                      version: artifact.latestVersion,
                    })}
                {" · "}
                {t("artifactScreens.list.updatedAt", {
                  date: new Date(artifact.updatedAt).toLocaleString(
                    i18n.language,
                  ),
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
