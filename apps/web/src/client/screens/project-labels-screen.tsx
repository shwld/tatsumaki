import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { LabelDeleteDialog } from "../components/label-delete-dialog";
import { LabelPlanRow, type MemberOption } from "../components/label-plan-row";
import { ProjectPage } from "../components/project-page";
import { useAuthError } from "../contexts/auth-error-context";
import { useProjectLabelMutations } from "../hooks/use-project-label-mutations";
import {
  disableEpic,
  fetchEpics,
  fetchLabelDeletionImpact,
} from "../lib/label-planning-api";
import { projectLabelsApiPath } from "../lib/story-routes";
import type { Epic, LabelDeletionImpact } from "../types/epic";
import type {
  ProjectLabel,
  ProjectLabelsResponse,
} from "../types/project-label";
import type { ProjectMemberRole } from "../types/project";

type MembersPayload = {
  currentMemberRole?: ProjectMemberRole;
  members?: Array<{ userId?: string; displayName?: string | null }>;
};

type Loaded = {
  labels: ProjectLabel[];
  epics: Epic[];
  members: MemberOption[];
  role: ProjectMemberRole | null;
};

type DeleteTarget = {
  label: ProjectLabel;
  impact: LabelDeletionImpact | null;
  error: string | null;
  isBusy: boolean;
};

export function ProjectLabelsScreen() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { notifySessionExpired } = useAuthError();
  const { deleteLabel } = useProjectLabelMutations(projectId ?? "");
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let ignore = false;
    setLoadError(false);
    const run = async () => {
      try {
        const [labelsResponse, membersResponse, epicsResult] =
          await Promise.all([
            fetch(projectLabelsApiPath(projectId)),
            fetch(`/api/projects/${projectId}/members`),
            fetchEpics(projectId),
          ]);
        if (ignore) return;
        if (
          labelsResponse.status === 401 ||
          membersResponse.status === 401 ||
          (!epicsResult.ok && epicsResult.status === 401)
        ) {
          notifySessionExpired();
          return;
        }
        if (!labelsResponse.ok || !membersResponse.ok || !epicsResult.ok) {
          setLoadError(true);
          return;
        }
        const labels = ((await labelsResponse.json()) as ProjectLabelsResponse)
          .labels;
        const membersPayload = (await membersResponse.json()) as MembersPayload;
        if (ignore) return;
        setData({
          labels: Array.isArray(labels) ? labels : [],
          epics: epicsResult.value,
          members: (membersPayload.members ?? [])
            .filter((m): m is { userId: string; displayName?: string | null } =>
              Boolean(m.userId),
            )
            .map((m) => ({ id: m.userId, name: m.displayName ?? m.userId })),
          role: membersPayload.currentMemberRole ?? null,
        });
      } catch {
        if (!ignore) setLoadError(true);
      }
    };
    void run();
    return () => {
      ignore = true;
    };
  }, [projectId, reloadKey, notifySessionExpired]);

  const replaceEpic = useCallback((epic: Epic) => {
    setData((current) =>
      current
        ? {
            ...current,
            epics: current.epics.some((e) => e.labelId === epic.labelId)
              ? current.epics.map((e) =>
                  e.labelId === epic.labelId ? epic : e,
                )
              : [...current.epics, epic],
          }
        : current,
    );
  }, []);

  const startDelete = async (label: ProjectLabel) => {
    if (!projectId) return;
    setDeleting({ label, impact: null, error: null, isBusy: true });
    const result = await fetchLabelDeletionImpact(projectId, label.id);
    if (!result.ok) {
      if (result.status === 401) {
        setDeleting(null);
        return notifySessionExpired();
      }
      setDeleting({
        label,
        impact: null,
        error: t("projectLabelsScreen.delete.impactError"),
        isBusy: false,
      });
      return;
    }
    setDeleting({ label, impact: result.value, error: null, isBusy: false });
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleting({ ...deleting, isBusy: true, error: null });
    const ok = await deleteLabel(deleting.label.id);
    if (!ok) {
      setDeleting({
        ...deleting,
        isBusy: false,
        error: t("projectLabelsScreen.delete.error"),
      });
      return;
    }
    const removedId = deleting.label.id;
    setData((current) =>
      current
        ? {
            ...current,
            labels: current.labels.filter((l) => l.id !== removedId),
            epics: current.epics.filter((e) => e.labelId !== removedId),
          }
        : current,
    );
    setDeleting(null);
  };

  const turnOffInstead = async () => {
    if (!deleting || !projectId) return;
    const epic = data?.epics.find((e) => e.labelId === deleting.label.id);
    if (!epic) return;
    setDeleting({ ...deleting, isBusy: true, error: null });
    const result = await disableEpic(
      projectId,
      deleting.label.id,
      epic.revision,
    );
    if (!result.ok) {
      if (result.status === 401) {
        setDeleting(null);
        return notifySessionExpired();
      }
      setDeleting({
        ...deleting,
        isBusy: false,
        error: t("projectLabelsScreen.planning.toggleError"),
      });
      return;
    }
    replaceEpic(result.value);
    setDeleting(null);
  };

  const canEdit = data?.role === "owner" || data?.role === "member";

  return (
    <ProjectPage title={t("projectLabelsScreen.title")}>
      <p className="mb-4 max-w-3xl text-sm text-gray-600">
        {t("projectLabelsScreen.description")}
      </p>
      {loadError ? (
        <div role="alert" className="text-sm text-red-700">
          <p>{t("projectLabelsScreen.loadError")}</p>
          <button
            type="button"
            className="mt-2 rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            {t("projectLabelsScreen.retry")}
          </button>
        </div>
      ) : !data ? (
        <p role="status" className="text-sm text-gray-600">
          {t("projectLabelsScreen.loading")}
        </p>
      ) : data.labels.length === 0 ? (
        <p className="text-sm text-gray-600">
          {t("projectLabelsScreen.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {data.labels.map((label) => (
            <LabelPlanRow
              key={label.id}
              projectId={projectId ?? ""}
              label={label}
              epic={data.epics.find((e) => e.labelId === label.id) ?? null}
              members={data.members}
              canEdit={canEdit}
              onEpicChange={replaceEpic}
              onSessionExpired={notifySessionExpired}
              onDelete={() => void startDelete(label)}
            />
          ))}
        </ul>
      )}
      {deleting ? (
        <LabelDeleteDialog
          labelName={deleting.label.name}
          impact={deleting.impact}
          error={deleting.error}
          isBusy={deleting.isBusy}
          onTurnOff={() => void turnOffInstead()}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </ProjectPage>
  );
}
