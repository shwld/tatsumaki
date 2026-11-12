import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { ProjectPage } from "../components/project-page";
import { projectStoryMapPath, projectStoryMapsPath } from "../lib/story-routes";
import { useStoryMapDetail } from "../lib/use-story-map-detail";
import {
  STORY_MAP_GOAL_MAX,
  STORY_MAP_TITLE_MAX,
} from "../../shared/story-map-limits";

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 disabled:opacity-60";
const buttonClass =
  "rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60";

function MetaForm({
  map,
  busy,
  cancelTo,
  onInvalid,
  onSave,
}: {
  map: { title: string; achievementGoal: string };
  busy: boolean;
  cancelTo: string;
  onInvalid: () => void;
  onSave: (patch: { title?: string; achievementGoal?: string }) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(map.title);
  const [goal, setGoal] = useState(map.achievementGoal);
  const saved = useRef({ title: map.title, goal: map.achievementGoal });

  // A reload after a failed command or another editor's change must not
  // replace a draft the user has not saved.
  useEffect(() => {
    const previous = saved.current;
    saved.current = { title: map.title, goal: map.achievementGoal };
    setTitle((draft) => (draft === previous.title ? map.title : draft));
    setGoal((draft) => (draft === previous.goal ? map.achievementGoal : draft));
  }, [map.title, map.achievementGoal]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim() === "") return onInvalid();
    // Only what this editor changed, so a save does not restore a field
    // someone else edited meanwhile.
    onSave({
      ...(title !== map.title ? { title } : {}),
      ...(goal !== map.achievementGoal ? { achievementGoal: goal } : {}),
    });
  };

  return (
    <form onSubmit={submit} className="mb-6 max-w-xl space-y-3">
      <label className="block text-sm text-gray-700">
        {t("storyMapEditScreen.titleLabel")}
        <input
          className={`mt-1 ${inputClass}`}
          value={title}
          disabled={busy}
          maxLength={STORY_MAP_TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="block text-sm text-gray-700">
        {t("storyMapEditScreen.goalLabel")}
        <textarea
          className={`mt-1 ${inputClass}`}
          rows={3}
          value={goal}
          disabled={busy}
          maxLength={STORY_MAP_GOAL_MAX}
          onChange={(event) => setGoal(event.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-blue-600 bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? t("storyMapEditScreen.saving") : t("storyMapEditScreen.save")}
        </button>
        <Link to={cancelTo} className={buttonClass}>
          {t("storyMapEditScreen.cancel")}
        </Link>
      </div>
    </form>
  );
}

export function StoryMapMetaEditScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId = "", mapId = "" } = useParams<{
    projectId: string;
    mapId: string;
  }>();
  const { detail, loadError, reload, run, busy, message, setMessage } =
    useStoryMapDetail(projectId, mapId);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const detailPath = projectStoryMapPath(projectId, mapId);
  const back = (
    <Link
      to={detailPath}
      className="mb-4 inline-block text-sm text-blue-700 underline"
    >
      {t("storyMapEditScreen.backToMap")}
    </Link>
  );

  if (loadError) {
    return (
      <ProjectPage title={t("projectStoryMapsScreen.title")}>
        <Link
          to={projectStoryMapsPath(projectId)}
          className="mb-4 inline-block text-sm text-blue-700 underline"
        >
          {t("storyMapEditScreen.back")}
        </Link>
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

  const messageEl = message ? (
    <p
      role={message.kind === "error" ? "alert" : "status"}
      className={`mb-3 text-sm ${message.kind === "error" ? "text-red-700" : "text-gray-700"}`}
    >
      {message.text}
    </p>
  ) : null;

  if (!canEdit) {
    return (
      <ProjectPage title={map.title}>
        {back}
        <p className="mb-3 text-sm text-gray-700">
          {t("storyMapEditScreen.viewerNotice")}
        </p>
      </ProjectPage>
    );
  }

  const saveMetadata = (patch: { title?: string; achievementGoal?: string }) =>
    void run({ type: "updateMap", ...patch }, null).then((ok) => {
      if (ok && active.current) void navigate(detailPath);
    });

  return (
    <ProjectPage title={map.title}>
      {back}
      {messageEl}
      {archived ? (
        <p className="mb-3 text-sm text-gray-700">
          {t("storyMapEditScreen.archivedNotice")}
        </p>
      ) : (
        <MetaForm
          key={map.id}
          map={map}
          busy={busy}
          cancelTo={detailPath}
          onInvalid={() =>
            setMessage({
              kind: "error",
              text: t("storyMapEditScreen.titleRequired"),
            })
          }
          onSave={saveMetadata}
        />
      )}
      <button
        type="button"
        disabled={busy}
        className={buttonClass}
        onClick={() =>
          void run({ type: "updateMap", archived: !archived }, null)
        }
      >
        {archived
          ? t("storyMapEditScreen.restore")
          : t("storyMapEditScreen.archive")}
      </button>
    </ProjectPage>
  );
}
