import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";
import { ProjectPage } from "../components/project-page";
import { useAuthError } from "../contexts/auth-error-context";
import {
  useArtifactList,
  useSetArtifactArchived,
  useSetArtifactPinned,
} from "../hooks/use-artifact-queries";
import { isAuthError, isHttpStatusError } from "../lib/api-error";
import { artifactPath } from "../lib/artifact-routes";

export function ArtifactListScreen() {
  const { t, i18n } = useTranslation();
  const { projectId = "" } = useParams<{ projectId: string }>();
  const { notifySessionExpired } = useAuthError();
  const [searchParams, setSearchParams] = useSearchParams();
  const showArchived = searchParams.get("archived") === "true";
  const query = useArtifactList(projectId, showArchived);
  const setPinned = useSetArtifactPinned(projectId);
  const setArchived = useSetArtifactArchived(projectId);
  const archiveForbidden =
    isHttpStatusError(setArchived.error) && setArchived.error.status === 403;

  const sessionExpired =
    isHttpStatusError(query.error) && isAuthError(query.error.status);
  useEffect(() => {
    if (sessionExpired) notifySessionExpired();
  }, [sessionExpired, notifySessionExpired]);

  return (
    <ProjectPage title={t("artifactScreens.list.title")}>
      <div role="tablist" className="mb-3 flex gap-2">
        {[false, true].map((archived) => (
          <button
            key={String(archived)}
            type="button"
            role="tab"
            aria-selected={showArchived === archived}
            className={`rounded border px-3 py-1 text-sm ${
              showArchived === archived
                ? "border-blue-700 text-blue-700"
                : "border-gray-300 text-gray-700"
            }`}
            onClick={() => {
              setArchived.reset();
              setSearchParams(archived ? { archived: "true" } : {});
            }}
          >
            {t(
              archived
                ? "artifactScreens.list.archivedTab"
                : "artifactScreens.list.activeTab",
            )}
          </button>
        ))}
      </div>
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
          {t(
            showArchived
              ? "artifactScreens.list.archivedEmpty"
              : "artifactScreens.list.empty",
          )}
        </p>
      ) : (
        <>
          {setPinned.isError ? (
            <p role="alert" className="mb-2 text-sm text-red-700">
              {t("artifactScreens.list.pinError")}
            </p>
          ) : null}
          {setArchived.isError ? (
            <p role="alert" className="mb-2 text-sm text-red-700">
              {t(
                archiveForbidden
                  ? "artifactScreens.list.archiveForbidden"
                  : "artifactScreens.list.archiveError",
              )}
            </p>
          ) : null}
          <ul className="max-w-3xl space-y-2">
            {query.data.artifacts.map((artifact) => (
              <li
                key={artifact.id}
                className="flex items-start gap-3 rounded-md border border-gray-200 px-4 py-3"
              >
                {showArchived ? null : (
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
                )}
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
                <button
                  type="button"
                  className="ml-auto shrink-0 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                  aria-label={t(
                    showArchived
                      ? "artifactScreens.list.restore"
                      : "artifactScreens.list.archive",
                    { title: artifact.title },
                  )}
                  disabled={setArchived.isPending}
                  onClick={() =>
                    setArchived.mutate({
                      artifactId: artifact.id,
                      archived: !showArchived,
                    })
                  }
                >
                  {t(
                    showArchived
                      ? "artifactScreens.detail.restoreAction"
                      : "artifactScreens.detail.archiveAction",
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </ProjectPage>
  );
}
