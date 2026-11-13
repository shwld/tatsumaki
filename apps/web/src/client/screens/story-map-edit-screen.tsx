import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { ProjectPage } from "../components/project-page";
import { StoryMapBoard } from "../components/story-map-board";
import { useStoryMapDetail } from "../lib/use-story-map-detail";
import {
  projectStoryMapEditPath,
  projectStoryMapsPath,
} from "../lib/story-routes";

const buttonClass =
  "rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60";

export function StoryMapEditScreen() {
  const { t } = useTranslation();
  const { projectId = "", mapId = "" } = useParams<{
    projectId: string;
    mapId: string;
  }>();
  const { detail, loadError, reload, live, message } = useStoryMapDetail(
    projectId,
    mapId,
  );

  const back = (
    <Link
      to={projectStoryMapsPath(projectId)}
      className="mb-4 inline-block text-sm text-blue-700 underline"
    >
      {t("storyMapEditScreen.back")}
    </Link>
  );

  if (loadError) {
    return (
      <ProjectPage title={t("projectStoryMapsScreen.title")}>
        {back}
        <div role="alert" className="text-sm text-red-700">
          <p>{t("storyMapEditScreen.loadError")}</p>
          <button
            type="button"
            className={`mt-2 ${buttonClass}`}
            onClick={reload}
          >
            {t("storyMapEditScreen.retry")}
          </button>
        </div>
      </ProjectPage>
    );
  }
  if (!detail) {
    return (
      <ProjectPage title={t("projectStoryMapsScreen.title")}>
        {back}
        <p role="status" className="text-sm text-gray-600">
          {t("storyMapEditScreen.loading")}
        </p>
      </ProjectPage>
    );
  }

  const { map } = detail.structure;
  const archived = map.archivedAt !== null;
  const canEdit = detail.role !== "viewer";

  return (
    <ProjectPage title={map.title}>
      {back}
      {archived ? (
        <p className="mb-3 text-sm text-gray-700">
          {t("storyMapEditScreen.archivedNotice")}
        </p>
      ) : null}
      {!canEdit ? (
        <p className="mb-3 text-sm text-gray-700">
          {t("storyMapEditScreen.viewerNotice")}
        </p>
      ) : null}
      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mb-3 text-sm ${message.kind === "error" ? "text-red-700" : "text-gray-700"}`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="mb-4 flex max-w-xl items-start justify-between gap-3 text-sm text-gray-700">
        <p
          className={`whitespace-pre-wrap break-words ${map.achievementGoal ? "" : "text-gray-500"}`}
        >
          {map.achievementGoal || t("storyMapEditScreen.goalNone")}
        </p>
        {canEdit ? (
          <Link
            to={projectStoryMapEditPath(projectId, mapId)}
            className="shrink-0 text-blue-700 underline"
          >
            {t("storyMapEditScreen.edit")}
          </Link>
        ) : null}
      </div>

      <p role="status" className="mb-2 text-xs text-gray-600">
        {t(`storyMapBoard.connection.${live.state.connection}`)}
        {live.state.connection === "connected"
          ? ` · ${t(`storyMapBoard.save_state.${live.state.save}`)}`
          : ""}
      </p>
      {live.state.rejections.length > 0 ? (
        <p role="alert" className="mb-2 text-xs text-red-700">
          {t("storyMapBoard.rejected")}
        </p>
      ) : null}
      {(live.state.structure ?? detail.structure) ? (
        <StoryMapBoard
          structure={live.state.structure ?? detail.structure}
          editable={
            live.state.structure !== null &&
            canEdit &&
            live.state.structure.map.archivedAt === null &&
            live.state.role !== "viewer" &&
            live.state.connection === "connected"
          }
          send={live.send}
        />
      ) : null}
    </ProjectPage>
  );
}
