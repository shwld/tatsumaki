import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { ProjectPage } from "../components/project-page";
import { StoryMapBoard } from "../components/story-map-board";
import { useStoryMapLive } from "../lib/use-story-map-live";
import { useAuthError } from "../contexts/auth-error-context";
import {
  fetchStoryMap,
  sendStoryMapCommand,
  type StoryMapDetail,
  type StoryMapMetadataCommand,
} from "../lib/story-maps-api";
import { projectStoryMapsPath } from "../lib/story-routes";
import {
  STORY_MAP_GOAL_MAX,
  STORY_MAP_PERSONA_MAX,
  STORY_MAP_TITLE_MAX,
} from "../../shared/story-map-limits";
import type { StoryMapPersona } from "../../domain/entities/story-map";

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 disabled:opacity-60";
const buttonClass =
  "rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60";

function PersonaRow({
  persona,
  onRename,
  onRemove,
}: {
  persona: StoryMapPersona;
  onRename: (name: string) => Promise<boolean>;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(persona.name);
  useEffect(() => setName(persona.name), [persona.name]);
  const changed = name.trim() !== persona.name && name.trim() !== "";
  return (
    <li className="flex items-center gap-2">
      <input
        aria-label={t("storyMapEditScreen.personaNameLabel")}
        className={inputClass}
        value={name}
        maxLength={STORY_MAP_TITLE_MAX}
        onChange={(event) => setName(event.target.value)}
      />
      <button
        type="button"
        className={buttonClass}
        disabled={!changed}
        onClick={() => void onRename(name)}
      >
        {t("storyMapEditScreen.personaRename")}
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label={`${t("storyMapEditScreen.personaRemove")}: ${persona.name}`}
        onClick={onRemove}
      >
        {t("storyMapEditScreen.personaRemove")}
      </button>
    </li>
  );
}

export function StoryMapEditScreen() {
  const { t } = useTranslation();
  const { projectId = "", mapId = "" } = useParams<{
    projectId: string;
    mapId: string;
  }>();
  const { notifySessionExpired } = useAuthError();
  const [loaded, setLoaded] = useState<StoryMapDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [newPersona, setNewPersona] = useState("");
  const savedMeta = useRef<{ title: string; goal: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "status";
    text: string;
  } | null>(null);

  useEffect(() => {
    savedMeta.current = null;
  }, [projectId, mapId]);

  useEffect(() => {
    let ignore = false;
    setLoadError(false);
    void fetchStoryMap(projectId, mapId).then((result) => {
      if (ignore) return;
      if (!result.ok) {
        if (result.status === 401) return notifySessionExpired();
        return setLoadError(true);
      }
      setLoaded(result.value);
      // A reload after a persona change or a failed command must not replace
      // a draft the user has not saved.
      const previous = savedMeta.current;
      const next = {
        title: result.value.structure.map.title,
        goal: result.value.structure.map.achievementGoal,
      };
      savedMeta.current = next;
      setTitle((draft) =>
        previous === null || draft === previous.title ? next.title : draft,
      );
      setGoal((draft) =>
        previous === null || draft === previous.goal ? next.goal : draft,
      );
    });
    return () => {
      ignore = true;
    };
  }, [projectId, mapId, reloadKey, notifySessionExpired]);

  // The previous map stays in state while the next one loads; never edit it
  // under the new route.
  const detail = loaded?.structure.map.id === mapId ? loaded : null;

  const live = useStoryMapLive(projectId, mapId);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  // Another editor's metadata change arrives over the socket; refetch so the
  // form and archive control follow it while unsaved drafts are kept.
  const liveMeta = live.state.structure
    ? JSON.stringify([
        live.state.structure.map.title,
        live.state.structure.map.achievementGoal,
        live.state.structure.map.archivedAt,
        live.state.structure.personas,
      ])
    : null;
  const loadedMeta = loaded
    ? JSON.stringify([
        loaded.structure.map.title,
        loaded.structure.map.achievementGoal,
        loaded.structure.map.archivedAt,
        loaded.structure.personas,
      ])
    : null;
  useEffect(() => {
    if (liveMeta !== null && loadedMeta !== null && liveMeta !== loadedMeta) {
      reload();
    }
  }, [liveMeta, loadedMeta, reload]);

  const run = async (
    command: StoryMapMetadataCommand,
    successText: string | null,
  ): Promise<boolean> => {
    setBusy(true);
    setMessage(null);
    const result = await sendStoryMapCommand(projectId, mapId, command);
    setBusy(false);
    if (result.ok) {
      if (successText) setMessage({ kind: "status", text: successText });
      reload();
      return true;
    }
    if (result.status === 401) {
      notifySessionExpired();
      return false;
    }
    const text =
      result.status === 403
        ? t("storyMapEditScreen.forbidden")
        : result.code === "INVALID_INPUT" || result.code === "invalid"
          ? t("storyMapEditScreen.titleRequired")
          : result.status === 409
            ? t("storyMapEditScreen.archivedConflict")
            : t("storyMapEditScreen.actionFailed");
    setMessage({ kind: "error", text });
    reload();
    return false;
  };

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

  const { map, personas } = detail.structure;
  const archived = map.archivedAt !== null;
  const canEdit = detail.role !== "viewer";
  const editable = canEdit && !archived;

  const saveMetadata = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim() === "") {
      return setMessage({
        kind: "error",
        text: t("storyMapEditScreen.titleRequired"),
      });
    }
    // Only what this editor changed, so a save does not restore a field
    // someone else edited meanwhile.
    void run(
      {
        type: "updateMap",
        ...(title !== map.title ? { title } : {}),
        ...(goal !== map.achievementGoal ? { achievementGoal: goal } : {}),
      },
      t("storyMapEditScreen.saved"),
    );
  };

  const addPersona = (event: FormEvent) => {
    event.preventDefault();
    if (newPersona.trim() === "") return;
    void run({ type: "addPersona", name: newPersona }, null).then((ok) => {
      if (ok) setNewPersona("");
    });
  };

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

      {editable ? (
        <form onSubmit={saveMetadata} className="mb-6 max-w-xl space-y-3">
          <label className="block text-sm text-gray-700">
            {t("storyMapEditScreen.titleLabel")}
            <input
              className={`mt-1 ${inputClass}`}
              value={title}
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
              maxLength={STORY_MAP_GOAL_MAX}
              onChange={(event) => setGoal(event.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md border border-blue-600 bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy
              ? t("storyMapEditScreen.saving")
              : t("storyMapEditScreen.save")}
          </button>
        </form>
      ) : (
        <div className="mb-6 max-w-xl text-sm text-gray-700">
          <p className="whitespace-pre-wrap break-words">
            {map.achievementGoal || t("storyMapEditScreen.goalNone")}
          </p>
        </div>
      )}

      <section className="mb-6 max-w-xl">
        <h2 className="mb-2 text-base font-semibold text-gray-900">
          {t("storyMapEditScreen.personasTitle")}
        </h2>
        {personas.length === 0 ? (
          <p className="text-sm text-gray-600">
            {t("storyMapEditScreen.personasNone")}
          </p>
        ) : editable ? (
          <ul className="space-y-2">
            {personas.map((persona) => (
              <PersonaRow
                key={persona.id}
                persona={persona}
                onRename={(name) =>
                  run(
                    { type: "renamePersona", personaId: persona.id, name },
                    null,
                  )
                }
                onRemove={() =>
                  void run(
                    { type: "removePersona", personaId: persona.id },
                    null,
                  )
                }
              />
            ))}
          </ul>
        ) : (
          <ul className="list-disc pl-5 text-sm text-gray-700">
            {personas.map((persona) => (
              <li key={persona.id}>{persona.name}</li>
            ))}
          </ul>
        )}
        {editable ? (
          personas.length >= STORY_MAP_PERSONA_MAX ? (
            <p className="mt-2 text-sm text-gray-600">
              {t("storyMapEditScreen.personaLimit", {
                max: STORY_MAP_PERSONA_MAX,
              })}
            </p>
          ) : (
            <form onSubmit={addPersona} className="mt-3 flex gap-2">
              <input
                aria-label={t("storyMapEditScreen.personaAddLabel")}
                className={inputClass}
                value={newPersona}
                maxLength={STORY_MAP_TITLE_MAX}
                onChange={(event) => setNewPersona(event.target.value)}
              />
              <button type="submit" disabled={busy} className={buttonClass}>
                {t("storyMapEditScreen.personaAdd")}
              </button>
            </form>
          )
        ) : null}
      </section>

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

      {canEdit ? (
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
      ) : null}
    </ProjectPage>
  );
}
