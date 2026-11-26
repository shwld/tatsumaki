import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import type { ProjectUsageView } from "../contexts/project-usage-context";
import { useProjectOperations } from "../hooks/use-project-operations";
import { formatDeadline } from "../lib/format-deadline";
import {
  OPERATION_BUTTON_CLASS,
  ProjectOperationControls,
} from "./project-operation-controls";

const SETTLE_POLL_INTERVAL_MS = 5_000;
const SETTLE_POLL_LIMIT = 24;

export function ProjectUsageBanner({ usage }: { usage: ProjectUsageView }) {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const isOwner = usage.role === "owner";
  const returned = searchParams.get("operation");
  const settling =
    returned === "resume" &&
    (usage.state === "read_only" ||
      usage.state === "loading" ||
      usage.state === "unknown");
  const waitingForResume = settling && usage.state !== "unknown";
  const [pollCount, setPollCount] = useState(0);
  const { refresh } = usage;

  useEffect(() => {
    if (!settling || pollCount >= SETTLE_POLL_LIMIT) return;
    const timer = window.setTimeout(() => {
      setPollCount((n) => n + 1);
      refresh();
    }, SETTLE_POLL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [settling, pollCount, refresh]);

  if (usage.state === "available" || usage.state === "loading") return null;
  if (usage.state === "limited" && !isOwner) return null;

  let body: ReactNode;
  if (usage.state === "limited" && usage.deadline) {
    body = (
      <>
        <p>
          {t("projectUsage.state.limited", {
            until: formatDeadline(usage.deadline.until, i18n.language),
          })}
        </p>
        <p>{t(`projectUsage.deadline.${usage.deadline.untilReason}`)}</p>
        <OwnerOperations projectId={usage.projectId} />
      </>
    );
  } else if (usage.state === "read_only") {
    body = (
      <>
        <p className="font-semibold">
          {t("projectUsage.banner.readOnlyTitle")}
        </p>
        <p>
          {isOwner
            ? t("projectUsage.banner.readOnlyOwner")
            : t("projectUsage.banner.readOnlyMember")}
        </p>
        {isOwner ? (
          <>
            {waitingForResume ? (
              <p role="status">
                {pollCount >= SETTLE_POLL_LIMIT
                  ? t("projectUsage.banner.resumeDelayed")
                  : t("projectUsage.banner.resumeWaiting")}
              </p>
            ) : returned === "resume-cancel" ? (
              <p>{t("projectUsage.banner.resumeCanceled")}</p>
            ) : null}
            <OwnerOperations projectId={usage.projectId} />
          </>
        ) : null}
      </>
    );
  } else {
    body = (
      <>
        <p>{t("projectUsage.banner.unknown")}</p>
        <button
          type="button"
          className={OPERATION_BUTTON_CLASS}
          onClick={usage.refresh}
        >
          {t("projectUsage.banner.retry")}
        </button>
      </>
    );
  }

  return (
    <div
      role="status"
      data-testid="project-usage-banner"
      className="space-y-2 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      {body}
    </div>
  );
}

function OwnerOperations({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { state, reload } = useProjectOperations();

  if (state.status === "loading") return null;
  if (state.status === "error" || !state.list.operationsAvailable) {
    return (
      <>
        <p>{t("projectUsage.operationsUnavailable")}</p>
        <button
          type="button"
          className={OPERATION_BUTTON_CLASS}
          onClick={reload}
        >
          {t("projectUsage.retry")}
        </button>
      </>
    );
  }
  const project = state.list.projects.find(
    (entry) => entry.projectId === projectId,
  );
  return project ? (
    <ProjectOperationControls
      key={projectId}
      project={project}
      from="settings"
      onFailed={reload}
    />
  ) : null;
}
