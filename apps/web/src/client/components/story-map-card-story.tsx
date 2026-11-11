import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type { StoryMapCard } from "../../domain/entities/story-map";
import {
  STORY_MAP_STORY_DESCRIPTION_MAX,
  STORY_MAP_TITLE_MAX,
} from "../../shared/story-map-limits";
import {
  searchStoriesForCard,
  type StoryMapStoryCandidate,
} from "../lib/story-maps-api";

type Send = (command: unknown) => void;

const buttonClass =
  "rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const inputClass =
  "w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900";

type StoryLinkPickerProps = {
  projectId: string;
  mapId: string;
  card: StoryMapCard;
  send: Send;
  onClose: () => void;
};

/** Finds a story of the same project and points the card at it. */
export function StoryLinkPicker({
  projectId,
  mapId,
  card,
  send,
  onClose,
}: StoryLinkPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "searching" }
    | { kind: "failed" }
    | { kind: "done"; stories: StoryMapStoryCandidate[] }
  >({ kind: "idle" });

  const search = async (event: FormEvent) => {
    event.preventDefault();
    setState({ kind: "searching" });
    const result = await searchStoriesForCard(projectId, mapId, query);
    setState(
      result.ok ? { kind: "done", stories: result.value } : { kind: "failed" },
    );
  };

  return (
    <div
      role="group"
      aria-label={t("storyMapBoard.linkStory")}
      className="space-y-1"
    >
      <form onSubmit={search} className="space-y-1">
        <label className="block">
          {t("storyMapBoard.linkSearchLabel")}
          <input
            className={inputClass}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className={buttonClass}
          disabled={state.kind === "searching"}
        >
          {t("storyMapBoard.linkSearch")}
        </button>
      </form>
      <div aria-live="polite">
        {state.kind === "searching" ? (
          <p>{t("storyMapBoard.linkSearching")}</p>
        ) : null}
        {state.kind === "failed" ? (
          <p role="alert" className="text-red-700">
            {t("storyMapBoard.linkSearchFailed")}
          </p>
        ) : null}
        {state.kind === "done" && state.stories.length === 0 ? (
          <p>{t("storyMapBoard.linkNoResults")}</p>
        ) : null}
      </div>
      {state.kind === "done" && state.stories.length > 0 ? (
        <ul className="space-y-1">
          {state.stories.map((story) => (
            <li
              key={story.id}
              className="flex items-center justify-between gap-1"
            >
              <span className="break-words">
                #{story.number} {story.title}{" "}
                <span className="text-gray-600">
                  {story.isIcebox ? "Icebox" : story.status}
                </span>
              </span>
              {story.placed && story.id !== card.storyId ? (
                <span className="text-gray-600">
                  {t("storyMapBoard.linkPlaced")}
                </span>
              ) : (
                <button
                  type="button"
                  className={buttonClass}
                  disabled={story.id === card.storyId}
                  aria-label={`${t("storyMapBoard.linkChoose")}: #${story.number} ${story.title}`}
                  onClick={() => {
                    send({
                      type: "setCardStory",
                      cardId: card.id,
                      storyId: story.id,
                    });
                    onClose();
                  }}
                >
                  {t("storyMapBoard.linkChoose")}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type StoryCreatePanelProps = {
  card: StoryMapCard;
  /** Where the card sits, used to seed the description. */
  context: { mapTitle: string; taskTitle: string; sliceTitle: string | null };
  send: Send;
  onClose: () => void;
};

/** Confirmation step that turns an idea card into a new story. */
export function StoryCreatePanel({
  card,
  context,
  send,
  onClose,
}: StoryCreatePanelProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(card.ideaTitle ?? "");
  const [description, setDescription] = useState(() =>
    [
      card.note,
      t("storyMapBoard.createStoryContextMap", { title: context.mapTitle }),
      t("storyMapBoard.createStoryContextTask", { title: context.taskTitle }),
      context.sliceTitle === null
        ? null
        : t("storyMapBoard.createStoryContextSlice", {
            title: context.sliceTitle,
          }),
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
  );
  const [storyType, setStoryType] = useState("feature");
  const [isIcebox, setIsIcebox] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (submitted || title.trim() === "") return;
    setSubmitted(true);
    send({
      type: "createStoryFromCard",
      cardId: card.id,
      title,
      description,
      storyType,
      isIcebox,
    });
    onClose();
  };

  return (
    <form
      onSubmit={submit}
      aria-label={t("storyMapBoard.createStoryHeading")}
      className="space-y-1"
    >
      <label className="block">
        {t("storyMapBoard.createStoryTitle")}
        <input
          className={inputClass}
          value={title}
          maxLength={STORY_MAP_TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="block">
        {t("storyMapBoard.createStoryDescription")}
        <textarea
          className={inputClass}
          rows={4}
          value={description}
          maxLength={STORY_MAP_STORY_DESCRIPTION_MAX}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <label className="block">
        {t("storyMapBoard.createStoryType")}
        <select
          className={inputClass}
          value={storyType}
          onChange={(event) => setStoryType(event.target.value)}
        >
          <option value="feature">
            {t("storyMapBoard.createStoryTypeFeature")}
          </option>
          <option value="bug">{t("storyMapBoard.createStoryTypeBug")}</option>
          <option value="chore">
            {t("storyMapBoard.createStoryTypeChore")}
          </option>
        </select>
      </label>
      <label className="block">
        {t("storyMapBoard.createStoryPlacement")}
        <select
          className={inputClass}
          value={isIcebox ? "icebox" : "backlog"}
          onChange={(event) => setIsIcebox(event.target.value === "icebox")}
        >
          <option value="backlog">
            {t("storyMapBoard.createStoryPlacementBacklog")}
          </option>
          <option value="icebox">
            {t("storyMapBoard.createStoryPlacementIcebox")}
          </option>
        </select>
      </label>
      <button
        type="submit"
        className={buttonClass}
        disabled={submitted || title.trim() === ""}
      >
        {t("storyMapBoard.createStorySubmit")}
      </button>
    </form>
  );
}
