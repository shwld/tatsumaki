import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { ProjectPage } from "../components/project-page";
import { StoryMapBoard } from "../components/story-map-board";
import { useStoryMapDetail } from "../lib/use-story-map-detail";
import {
  projectStoryMapEditPath,
  projectStoryMapsPath,
} from "../lib/story-routes";
import {
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
  const [newPersona, setNewPersona] = useState("");
  const { detail, loadError, reload, live, run, busy, message } =
    useStoryMapDetail(projectId, mapId);

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
    </ProjectPage>
  );
}
