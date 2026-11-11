import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { ProjectPage } from "../components/project-page";
import { StoryMapCreateForm } from "../components/story-map-create-form";
import { useAuthError } from "../contexts/auth-error-context";
import {
  fetchStoryMaps,
  sendStoryMapCommand,
  type StoryMapList,
} from "../lib/story-maps-api";
import { projectStoryMapPath } from "../lib/story-routes";
import type { StoryMap } from "../types/story-map";

export function ProjectStoryMapsScreen() {
  const { t } = useTranslation();
  const { projectId = "" } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { notifySessionExpired } = useAuthError();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [list, setList] = useState<StoryMapList | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    setLoadError(false);
    void (async () => {
      const result = await fetchStoryMaps(projectId, includeArchived);
      if (ignore) return;
      if (!result.ok) {
        if (result.status === 401) return notifySessionExpired();
        return setLoadError(true);
      }
      setList(result.value);
    })();
    return () => {
      ignore = true;
    };
  }, [projectId, includeArchived, reloadKey, notifySessionExpired]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  const canEdit = list !== null && list.role !== "viewer";

  const setArchived = async (map: StoryMap, archived: boolean) => {
    setActionError(null);
    const result = await sendStoryMapCommand(projectId, map.id, {
      type: "updateMap",
      archived,
    });
    if (result.ok) return reload();
    if (result.status === 401) return notifySessionExpired();
    setActionError(
      result.status === 403
        ? t("projectStoryMapsScreen.forbidden")
        : t("projectStoryMapsScreen.actionFailed"),
    );
  };

  return (
    <ProjectPage title={t("projectStoryMapsScreen.title")}>
      <p className="mb-4 max-w-3xl text-sm text-gray-600">
        {t("projectStoryMapsScreen.description")}
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {canEdit ? (
          <button
            type="button"
            className="rounded-md border border-blue-600 bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            onClick={() => setCreating(true)}
          >
            {t("projectStoryMapsScreen.create")}
          </button>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
          {t("projectStoryMapsScreen.showArchived")}
        </label>
      </div>
      {creating ? (
        <StoryMapCreateForm
          projectId={projectId}
          onCancel={() => setCreating(false)}
          onCreated={(map) => navigate(projectStoryMapPath(projectId, map.id))}
        />
      ) : null}
      {actionError ? (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {actionError}
        </p>
      ) : null}
      {loadError ? (
        <div role="alert" className="text-sm text-red-700">
          <p>{t("projectStoryMapsScreen.loadError")}</p>
          <button
            type="button"
            className="mt-2 rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
            onClick={reload}
          >
            {t("projectStoryMapsScreen.retry")}
          </button>
        </div>
      ) : !list ? (
        <p role="status" className="text-sm text-gray-600">
          {t("projectStoryMapsScreen.loading")}
        </p>
      ) : list.storyMaps.length === 0 ? (
        <div className="text-sm text-gray-600">
          <p>{t("projectStoryMapsScreen.empty")}</p>
          {canEdit ? <p>{t("projectStoryMapsScreen.emptyCanCreate")}</p> : null}
        </div>
      ) : (
        <ul className="max-w-3xl space-y-3">
          {list.storyMaps.map((map) => {
            return (
              <li
                key={map.id}
                className="rounded-md border border-gray-300 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={projectStoryMapPath(projectId, map.id)}
                      className="break-words font-medium text-blue-700 hover:underline"
                    >
                      {map.title}
                    </Link>
                    {map.archivedAt ? (
                      <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700">
                        {t("projectStoryMapsScreen.archivedBadge")}
                      </span>
                    ) : null}
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">
                      {map.achievementGoal ||
                        t("projectStoryMapsScreen.goalNone")}
                    </p>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => void setArchived(map, !map.archivedAt)}
                    >
                      {map.archivedAt
                        ? t("projectStoryMapsScreen.restore")
                        : t("projectStoryMapsScreen.archive")}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ProjectPage>
  );
}
