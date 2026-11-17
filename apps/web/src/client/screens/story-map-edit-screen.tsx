import { Info } from "lucide-react";
import { useState } from "react";
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
  const [expanded, setExpanded] = useState(false);
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
    <main className="flex min-h-0 flex-1 flex-col px-4 py-2">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 truncate text-base font-semibold text-gray-900">
          {map.title}
        </h1>
        <p role="status" className="shrink-0 text-xs text-gray-600">
          {t(`storyMapBoard.connection.${live.state.connection}`)}
          {live.state.connection === "connected"
            ? ` · ${t(`storyMapBoard.save_state.${live.state.save}`)}`
            : ""}
        </p>
        {canEdit ? (
          <Link
            to={projectStoryMapEditPath(projectId, mapId)}
            className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900"
          >
            {t("storyMapEditScreen.edit")}
          </Link>
        ) : null}
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded text-gray-600 hover:bg-gray-100"
          aria-expanded={expanded}
          aria-controls="story-map-details"
          aria-label={
            expanded
              ? t("storyMapEditScreen.hideDetails")
              : t("storyMapEditScreen.showDetails")
          }
          onClick={() => setExpanded((value) => !value)}
        >
          <Info className="size-4" aria-hidden="true" />
        </button>
      </div>

      {expanded ? (
        <div
          id="story-map-details"
          className="mt-2 flex flex-col gap-2 text-sm text-gray-700"
        >
          <p
            className={`max-w-xl whitespace-pre-wrap break-words ${map.achievementGoal ? "" : "text-gray-500"}`}
          >
            {map.achievementGoal || t("storyMapEditScreen.goalNone")}
          </p>
          {back}
        </div>
      ) : null}

      {archived ? (
        <p className="mt-1 text-sm text-gray-700">
          {t("storyMapEditScreen.archivedNotice")}
        </p>
      ) : null}
      {!canEdit ? (
        <p className="mt-1 text-sm text-gray-700">
          {t("storyMapEditScreen.viewerNotice")}
        </p>
      ) : null}
      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mt-1 text-sm ${message.kind === "error" ? "text-red-700" : "text-gray-700"}`}
        >
          {message.text}
        </p>
      ) : null}
      {live.state.rejections.length > 0 ? (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {t("storyMapBoard.rejected")}{" "}
          {t(
            `storyMapBoard.rejectedBy.${live.state.rejections[live.state.rejections.length - 1]}`,
          )}
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
    </main>
  );
}
