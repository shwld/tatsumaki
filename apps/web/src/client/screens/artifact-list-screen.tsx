import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { ProjectPage } from "../components/project-page";
import { useAuthError } from "../contexts/auth-error-context";
import {
  useArtifactList,
  useSetArtifactPinned,
} from "../hooks/use-artifact-queries";
import { isAuthError, isHttpStatusError } from "../lib/api-error";
import { artifactPath } from "../lib/artifact-routes";

export function ArtifactListScreen() {
  const { t, i18n } = useTranslation();
  const { projectId = "" } = useParams<{ projectId: string }>();
  const { notifySessionExpired } = useAuthError();
  const query = useArtifactList(projectId);
  const setPinned = useSetArtifactPinned(projectId);

  const sessionExpired =
    isHttpStatusError(query.error) && isAuthError(query.error.status);
  useEffect(() => {
    if (sessionExpired) notifySessionExpired();
  }, [sessionExpired, notifySessionExpired]);

  return (
    <ProjectPage title={t("artifactScreens.list.title")}>
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
        <>
          {setPinned.isError ? (
            <p role="alert" className="mb-2 text-sm text-red-700">
              {t("artifactScreens.list.pinError")}
            </p>
          ) : null}
          <ul className="max-w-3xl space-y-2">
            {query.data.artifacts.map((artifact) => (
              <li
                key={artifact.id}
                className="flex items-start gap-3 rounded-md border border-gray-200 px-4 py-3"
              >
                <button
                  type="button"
                  aria-pressed={artifact.pinned}
                  aria-label={t(
                    artifact.pinned
                      ? "artifactScreens.list.unpin"
                      : "artifactScreens.list.pin",
                    { title: artifact.title },
                  )}
                  disabled={setPinned.isPending}
                  className={`mt-0.5 text-lg leading-none ${
                    artifact.pinned ? "text-amber-600" : "text-gray-400"
                  }`}
                  onClick={() =>
                    setPinned.mutate({
                      artifactId: artifact.id,
                      pinned: !artifact.pinned,
                    })
                  }
                >
                  {artifact.pinned ? "★" : "☆"}
                </button>
                <div className="min-w-0">
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
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </ProjectPage>
  );
}
