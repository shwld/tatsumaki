import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { ArtifactPreview } from "../components/artifact-preview";
import { useAuthError } from "../contexts/auth-error-context";
import {
  useArtifactDetail,
  useArtifactVersions,
  useMemberNames,
} from "../hooks/use-artifact-queries";
import { isAuthError, isHttpStatusError } from "../lib/api-error";
import {
  artifactPath,
  artifactVersionPath,
  projectArtifactsPath,
} from "../lib/artifact-routes";
import { formatBytes } from "../lib/format-bytes";

const SHORT_ID_LENGTH = 8;
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
  const memberNames = useMemberNames(projectId);
  const [expanded, setExpanded] = useState(false);

  const sessionExpired = [detail.error, versions.error].some(
    (error) => isHttpStatusError(error) && isAuthError(error.status),
  );
  useEffect(() => {
    if (sessionExpired) notifySessionExpired();
  }, [sessionExpired, notifySessionExpired]);

  if (detail.isPending || versions.isPending) {
    if (!detail.isError && !versions.isError) {
      return (
        <main className="mx-auto w-full max-w-4xl p-4">
          <p role="status" className="text-sm text-gray-600">
            {t("artifactScreens.detail.loading")}
          </p>
        </main>
      );
    }
  }

  const notFound = [detail.error, versions.error].some(
    (error) => isHttpStatusError(error) && error.status === 404,
  );
  if (notFound || (versionParam && !VERSION_PATTERN.test(versionParam))) {
    return (
      <main className="mx-auto w-full max-w-4xl p-4">
        <p role="alert" className="text-sm text-gray-700">
          {t("artifactScreens.detail.notFound")}{" "}
          <Link
            className="font-medium text-blue-700"
            to={projectArtifactsPath(projectId)}
          >
            {t("artifactScreens.breadcrumb")}
          </Link>
        </p>
      </main>
    );
  }

  if (detail.isError || versions.isError || !detail.data || !versions.data) {
    return (
      <main className="mx-auto w-full max-w-4xl p-4">
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
      </main>
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
      <main className="mx-auto w-full max-w-4xl p-4">
        <p role="alert" className="text-sm text-gray-700">
          {t("artifactScreens.detail.notFound")}
        </p>
      </main>
    );
  }

  const creatorId = shown?.createdBy ?? artifact.createdBy;
  const creator =
    memberNames.data?.get(creatorId) ?? creatorId.slice(0, SHORT_ID_LENGTH);
  const formatDate = (value: string) =>
    new Date(value).toLocaleString(i18n.language);

  return (
    <main className="mx-auto w-full max-w-4xl p-4">
      <h1 className="text-xl font-semibold text-gray-900">{artifact.title}</h1>
      {artifact.archivedAt ? (
        <p
          role="status"
          className="mt-2 inline-block rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700"
        >
          {t("artifactScreens.detail.archived")}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
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
        <button
          type="button"
          className="rounded border border-gray-300 px-2 py-1 text-gray-900"
          aria-expanded={expanded}
          aria-controls="artifact-metadata"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? t("artifactScreens.detail.hideMetadata")
            : t("artifactScreens.detail.showMetadata")}
        </button>
      </div>

      {expanded ? (
        <dl
          id="artifact-metadata"
          className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
        >
          <dt className="text-gray-600">{t("artifactScreens.detail.id")}</dt>
          <dd className="break-all text-gray-900">{artifact.id}</dd>
          <dt className="text-gray-600">
            {t("artifactScreens.detail.createdBy")}
          </dt>
          <dd className="text-gray-900">{creator}</dd>
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
              <dd className="text-gray-900">{formatBytes(shown.totalBytes)}</dd>
            </>
          ) : null}
        </dl>
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

      <section className="mt-4">
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
