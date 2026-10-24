import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIssuePreviewToken } from "../hooks/use-artifact-queries";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError, isHttpStatusError } from "../lib/api-error";

type ArtifactPreviewProps = {
  projectId: string;
  artifactId: string;
  version: number;
  title: string;
};

/**
 * ADR-0010: the frame has an opaque origin and no feature permissions, and the
 * parent never listens to it, so the only thing the artifact can do to this
 * page is use its own frame. Rendered with `key={version}` so a version change
 * remounts it and issues a new token.
 */
export function ArtifactPreview({
  projectId,
  artifactId,
  version,
  title,
}: ArtifactPreviewProps) {
  const { t } = useTranslation();
  const issue = useIssuePreviewToken(projectId, artifactId, version);
  const { mutate } = issue;
  const { notifySessionExpired } = useAuthError();
  const [expired, setExpired] = useState(false);

  const load = useCallback(() => {
    setExpired(false);
    mutate();
  }, [mutate]);

  useEffect(() => {
    load();
  }, [load]);

  const sessionExpired =
    isHttpStatusError(issue.error) && isAuthError(issue.error.status);
  useEffect(() => {
    if (sessionExpired) notifySessionExpired();
  }, [sessionExpired, notifySessionExpired]);

  const expiresAt = issue.data?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const deadline = Date.parse(expiresAt);
    const check = () => {
      if (Date.now() >= deadline) setExpired(true);
    };
    const timer = window.setTimeout(
      check,
      Math.max(0, deadline - Date.now()) + 50,
    );
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [expiresAt]);

  if (issue.isError) {
    const unavailable =
      isHttpStatusError(issue.error) && issue.error.status === 404;
    return (
      <div role="alert" className="rounded border border-gray-200 p-4 text-sm">
        <p>
          {t(
            unavailable
              ? "artifactScreens.preview.unavailable"
              : "artifactScreens.preview.error",
          )}
        </p>
        {unavailable ? null : (
          <button
            type="button"
            className="mt-2 rounded border border-gray-300 px-3 py-1 text-sm"
            onClick={load}
          >
            {t("artifactScreens.preview.reload")}
          </button>
        )}
      </div>
    );
  }

  if (expired) {
    return (
      <div role="status" className="rounded border border-gray-200 p-4 text-sm">
        <p>{t("artifactScreens.preview.expired")}</p>
        <button
          type="button"
          className="mt-2 rounded border border-gray-300 px-3 py-1 text-sm"
          onClick={load}
        >
          {t("artifactScreens.preview.reload")}
        </button>
      </div>
    );
  }

  if (!issue.data) {
    return (
      <p role="status" className="p-4 text-sm text-gray-600">
        {t("artifactScreens.preview.loading")}
      </p>
    );
  }

  return (
    <iframe
      title={t("artifactScreens.preview.title", { title, version })}
      src={issue.data.contentPath}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      allow=""
      className="h-[70vh] w-full rounded border border-gray-200 bg-white"
    />
  );
}
