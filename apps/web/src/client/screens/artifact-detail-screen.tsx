import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { ActorLabel } from "../components/actor-label";
import { ArtifactPreview } from "../components/artifact-preview";
import { ProjectPage } from "../components/project-page";
import { useAuthError } from "../contexts/auth-error-context";
import {
  useArtifactDetail,
  useArtifactVersions,
  useMembers,
  useSetArtifactArchived,
} from "../hooks/use-artifact-queries";
import { isAuthError, isHttpStatusError } from "../lib/api-error";
import {
  artifactPath,
  artifactVersionPath,
  projectArtifactsPath,
} from "../lib/artifact-routes";
import { formatBytes } from "../lib/format-bytes";

const VERSION_PATTERN = /^[1-9][0-9]*$/;

export function ArtifactDetailScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    projectId = "",
    artifactId = "",
    version: versionParam,
  } = useParams<{
    projectId: string;
    artifactId: string;
    version?: string;
  }>();
  const { notifySessionExpired } = useAuthError();
  const detail = useArtifactDetail(projectId, artifactId);
  const versions = useArtifactVersions(projectId, artifactId);
  const members = useMembers(projectId);
  const [expanded, setExpanded] = useState(false);
  const setArchived = useSetArtifactArchived(projectId);

  const sessionExpired = [detail.error, versions.error].some(
    (error) => isHttpStatusError(error) && isAuthError(error.status),
  );
  useEffect(() => {
    if (sessionExpired) notifySessionExpired();
  }, [sessionExpired, notifySessionExpired]);

  if (detail.isPending || versions.isPending) {
    if (!detail.isError && !versions.isError) {
      return (
        <ProjectPage title={t("artifactScreens.list.title")}>
          <p role="status" className="text-sm text-gray-600">
            {t("artifactScreens.detail.loading")}
          </p>
        </ProjectPage>
      );
    }
  }

  const notFound = [detail.error, versions.error].some(
    (error) => isHttpStatusError(error) && error.status === 404,
  );
  if (notFound || (versionParam && !VERSION_PATTERN.test(versionParam))) {
    return (
      <ProjectPage title={t("artifactScreens.list.title")}>
        <p role="alert" className="text-sm text-gray-700">
          {t("artifactScreens.detail.notFound")}{" "}
          <Link
            className="font-medium text-blue-700"
            to={projectArtifactsPath(projectId)}
          >
            {t("artifactScreens.breadcrumb")}
          </Link>
        </p>
      </ProjectPage>
    );
  }

  if (detail.isError || versions.isError || !detail.data || !versions.data) {
    return (
      <ProjectPage title={t("artifactScreens.list.title")}>
        <div role="alert" className="text-sm text-red-700">
          <p>{t("artifactScreens.detail.loadError")}</p>
          <button
            type="button"
            className="mt-2 rounded border border-gray-300 px-3 py-1 text-gray-900"
            onClick={() => {
              void detail.refetch();
              void versions.refetch();
            }}
          >
            {t("artifactScreens.detail.retry")}
          </button>
        </div>
      </ProjectPage>
    );
  }

  const { artifact } = detail.data;
  const latest = artifact.latestVersion;
  // The unpinned route follows the detail response, which is consistent with
  // itself; the versions list is a separate request and can lag behind it.
  const shown = versionParam
    ? versions.data.versions.find(
        (item) => item.version === Number(versionParam),
      )
    : (detail.data.latestVersion ?? undefined);
  const selectable =
    shown &&
    !versions.data.versions.some((item) => item.version === shown.version)
      ? [shown, ...versions.data.versions]
      : versions.data.versions;

  if (versionParam && !shown) {
    return (
      <ProjectPage title={t("artifactScreens.list.title")}>
        <p role="alert" className="text-sm text-gray-700">
          {t("artifactScreens.detail.notFound")}
        </p>
      </ProjectPage>
    );
  }

  const creatorId = shown?.createdBy ?? artifact.createdBy;
  const creator = members.data?.get(creatorId);
  const formatDate = (value: string) =>
    new Date(value).toLocaleString(i18n.language);

  return (
    <main className="flex min-h-0 flex-1 flex-col px-4 py-2">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 truncate text-base font-semibold text-gray-900">
          {artifact.title}
        </h1>
        {artifact.archivedAt ? (
          <p
            role="status"
            className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700"
          >
            {t("artifactScreens.detail.archived")}
          </p>
        ) : null}
        <button
          type="button"
          className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900"
          disabled={setArchived.isPending}
          onClick={() =>
            setArchived.mutate(
              { artifactId, archived: !artifact.archivedAt },
              {
                onSuccess: () => {
                  void detail.refetch();
                },
              },
            )
          }
        >
          {t(
            artifact.archivedAt
              ? "artifactScreens.detail.restoreAction"
              : "artifactScreens.detail.archiveAction",
          )}
        </button>
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded text-gray-600 hover:bg-gray-100"
          aria-expanded={expanded}
          aria-controls="artifact-details"
          aria-label={
            expanded
              ? t("artifactScreens.detail.hideMetadata")
              : t("artifactScreens.detail.showMetadata")
          }
          onClick={() => setExpanded((value) => !value)}
        >
          <Info className="size-4" aria-hidden="true" />
        </button>
      </div>

      {setArchived.isError ? (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {t(
            isHttpStatusError(setArchived.error) &&
              setArchived.error.status === 403
              ? "artifactScreens.list.archiveForbidden"
              : "artifactScreens.list.archiveError",
          )}
        </p>
      ) : null}

      {expanded ? (
        <div id="artifact-details" className="mt-2 text-sm">
          <label className="flex items-center gap-2 text-gray-600">
            <span>{t("artifactScreens.detail.versionLabel")}</span>
            <select
              id="artifact-version"
              className="rounded border border-gray-300 px-2 py-1 text-gray-900"
              value={shown?.version ?? ""}
              disabled={selectable.length === 0}
              onChange={(event) =>
                navigate(
                  artifactVersionPath(
                    projectId,
                    artifactId,
                    Number(event.target.value),
                  ),
                )
              }
            >
              {shown ? null : <option value="" />}
              {selectable.map((item) => (
                <option key={item.version} value={item.version}>
                  {t("artifactScreens.detail.versionOption", {
                    version: item.version,
                  })}
                </option>
              ))}
            </select>
          </label>
          <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-600">{t("artifactScreens.detail.id")}</dt>
            <dd className="break-all text-gray-900">{artifact.id}</dd>
            <dt className="text-gray-600">
              {t("artifactScreens.detail.createdBy")}
            </dt>
            <dd className="text-gray-900">
              <ActorLabel key={creatorId} member={creator} actorName={null} />
            </dd>
            <dt className="text-gray-600">
              {t("artifactScreens.detail.createdAt")}
            </dt>
            <dd className="text-gray-900">
              {formatDate(shown?.createdAt ?? artifact.createdAt)}
            </dd>
            {shown ? (
              <>
                <dt className="text-gray-600">
                  {t("artifactScreens.detail.fileCount")}
                </dt>
                <dd className="text-gray-900">{shown.fileCount}</dd>
                <dt className="text-gray-600">
                  {t("artifactScreens.detail.totalSize")}
                </dt>
                <dd className="text-gray-900">
                  {formatBytes(shown.totalBytes)}
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}

      {versionParam && latest !== null && shown?.version !== latest ? (
        <p role="status" className="mt-3 text-sm text-gray-700">
          {t("artifactScreens.detail.notLatest")}{" "}
          <Link
            className="font-medium text-blue-700"
            to={artifactPath(projectId, artifactId)}
          >
            {t("artifactScreens.detail.openLatest", { version: latest })}
          </Link>
        </p>
      ) : null}

      <section className="mt-2 flex min-h-0 flex-1 flex-col">
        {!shown ? (
          <p role="status" className="text-sm text-gray-700">
            {t("artifactScreens.detail.noVersion")}
          </p>
        ) : shown.entrypoint === "" ? (
          <p role="alert" className="text-sm text-gray-700">
            {t("artifactScreens.detail.brokenEntrypoint")}
          </p>
        ) : (
          <ArtifactPreview
            key={shown.version}
            projectId={projectId}
            artifactId={artifactId}
            title={artifact.title}
            version={shown.version}
          />
        )}
      </section>
    </main>
  );
}
