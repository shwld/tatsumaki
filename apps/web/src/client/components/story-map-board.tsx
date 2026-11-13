import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type {
  StoryMapActivity,
  StoryMapCard,
  StoryMapSlice,
  StoryMapStructure,
  StoryMapTask,
} from "../../domain/entities/story-map";
import {
  STORY_MAP_NOTE_MAX,
  STORY_MAP_TITLE_MAX,
} from "../../shared/story-map-limits";
import { projectStoryDetailPath } from "../lib/story-routes";
import { StoryCreatePanel, StoryLinkPicker } from "./story-map-card-story";

type Send = (command: unknown) => void;

const byPosition = <T extends { position: number; id: string }>(a: T, b: T) =>
  a.position - b.position || a.id.localeCompare(b.id);

const buttonClass =
  "rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";
const inputClass =
  "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
const dangerButtonClass = `${buttonClass} border-red-400 text-red-700 dark:border-red-500 dark:text-red-300`;
const ghostAddClass =
  "rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-xs text-gray-600 hover:border-gray-400 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800";
/** Controls stay in the tab order but only show on hover/focus where a pointer exists. */
const revealClass =
  "[@media(hover:hover)]:opacity-0 group-hover/header:opacity-100 group-focus-within/header:opacity-100 focus-within:opacity-100";
const cardRevealClass =
  "[@media(hover:hover)]:opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-within:opacity-100";

/** Left accent per card state: idea, missing, then the linked story's status. */
const STATUS_TONE: Record<string, string> = {
  Unstarted: "border-l-gray-400 dark:border-l-slate-400",
  Started: "border-l-sky-500",
  Finished: "border-l-amber-500",
  Delivered: "border-l-purple-500",
  Accepted: "border-l-emerald-500",
  Rejected: "border-l-red-500",
};
const ICEBOX_TONE = "border-l-cyan-400";
const IDEA_TONE = "border-l-gray-300 border-dashed dark:border-l-slate-500";
const MISSING_TONE = "border-l-red-400 border-dashed";

function cardTone(card: StoryMapCard): string {
  if (card.storyState === "missing") return MISSING_TONE;
  if (card.story) {
    if (card.story.isIcebox) return ICEBOX_TONE;
    return STATUS_TONE[card.story.status] ?? STATUS_TONE.Unstarted;
  }
  return card.storyId !== null ? STATUS_TONE.Unstarted : IDEA_TONE;
}

/** The unplanned row has no slice. It is shown first and cannot be edited. */
const UNPLANNED = "";

type Row = { key: string; sliceId: string | null; slice: StoryMapSlice | null };

function cardsIn(
  structure: StoryMapStructure,
  taskId: string,
  sliceId: string | null,
): StoryMapCard[] {
  return structure.cards
    .filter((card) => card.taskId === taskId && card.sliceId === sliceId)
    .sort(byPosition);
}

function InlineAdd({
  label,
  onAdd,
}: {
  label: string;
  onAdd: (title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const { t } = useTranslation();
  if (!open) {
    return (
      <button
        type="button"
        className={ghostAddClass}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">+ </span>
        {label}
      </button>
    );
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim() === "") return;
    onAdd(title);
    setTitle("");
    setOpen(false);
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <input
        aria-label={label}
        className={inputClass}
        value={title}
        maxLength={STORY_MAP_TITLE_MAX}
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      />
      <button type="submit" className={buttonClass}>
        {t("storyMapBoard.add")}
      </button>
    </form>
  );
}

/** Rename, reorder and delete controls shared by activities, tasks and slices. */
function HeaderControls({
  title,
  kind,
  canMovePrev,
  canMoveNext,
  deleteImpact,
  onRename,
  onMove,
  onDelete,
}: {
  title: string;
  kind: string;
  canMovePrev: boolean;
  canMoveNext: boolean;
  deleteImpact: string;
  onRename: (title: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [draft, setDraft] = useState(title);

  if (mode === "rename") {
    const submit = (event: FormEvent) => {
      event.preventDefault();
      if (draft.trim() !== "" && draft !== title) onRename(draft);
      setMode("idle");
    };
    return (
      <form onSubmit={submit} className="flex items-center gap-1">
        <input
          aria-label={`${t("storyMapBoard.rename")}: ${title}`}
          className={inputClass}
          value={draft}
          maxLength={STORY_MAP_TITLE_MAX}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setMode("idle");
          }}
        />
        <button type="submit" className={buttonClass}>
          {t("storyMapBoard.save")}
        </button>
      </form>
    );
  }
  if (mode === "delete") {
    return (
      <div
        role="alertdialog"
        aria-label={`${t("storyMapBoard.delete")}: ${title}`}
      >
        <p className="mb-1 text-xs text-gray-800 dark:text-slate-100">
          {t("storyMapBoard.deleteConfirm", { kind, title })}
          {deleteImpact ? ` ${deleteImpact}` : ""}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            className={dangerButtonClass}
            onClick={() => {
              onDelete();
              setMode("idle");
            }}
          >
            {t("storyMapBoard.delete")}
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => setMode("idle")}
          >
            {t("storyMapBoard.cancel")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={`mt-1 flex flex-wrap gap-1 ${revealClass}`}>
      <button
        type="button"
        className={buttonClass}
        aria-label={`${t("storyMapBoard.rename")}: ${title}`}
        onClick={() => {
          setDraft(title);
          setMode("rename");
        }}
      >
        {t("storyMapBoard.rename")}
      </button>
      <button
        type="button"
        className={buttonClass}
        disabled={!canMovePrev}
        aria-label={`${t("storyMapBoard.movePrev")}: ${title}`}
        onClick={() => onMove(-1)}
      >
        ←
      </button>
      <button
        type="button"
        className={buttonClass}
        disabled={!canMoveNext}
        aria-label={`${t("storyMapBoard.moveNext")}: ${title}`}
        onClick={() => onMove(1)}
      >
        →
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label={`${t("storyMapBoard.delete")}: ${title}`}
        onClick={() => setMode("delete")}
      >
        {t("storyMapBoard.delete")}
      </button>
    </div>
  );
}

function CardMenu({
  card,
  structure,
  tasks,
  rows,
  send,
  onClose,
}: {
  card: StoryMapCard;
  structure: StoryMapStructure;
  tasks: StoryMapTask[];
  rows: Row[];
  send: Send;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(card.ideaTitle ?? "");
  const [note, setNote] = useState(card.note);
  const [taskId, setTaskId] = useState(card.taskId);
  const [sliceKey, setSliceKey] = useState(card.sliceId ?? UNPLANNED);
  const [afterId, setAfterId] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [panel, setPanel] = useState<"link" | "create" | null>(null);

  const sliceId = sliceKey === UNPLANNED ? null : sliceKey;
  const siblings = cardsIn(structure, taskId, sliceId).filter(
    (other) => other.id !== card.id,
  );
  const cardLabel = (other: StoryMapCard) =>
    (other.story ? `#${other.story.number} ${other.story.title}` : null) ??
    other.ideaTitle ??
    t("storyMapBoard.storyCard");

  const move = (event: FormEvent) => {
    event.preventDefault();
    const stillThere = afterId === "" || siblings.some((s) => s.id === afterId);
    send({
      type: "moveCard",
      cardId: card.id,
      taskId,
      sliceId,
      afterCardId: stillThere && afterId !== "" ? afterId : null,
    });
    onClose();
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    send({
      type: "updateCard",
      cardId: card.id,
      ...(card.storyId === null && title !== (card.ideaTitle ?? "")
        ? { ideaTitle: title }
        : {}),
      ...(note !== card.note ? { note } : {}),
    });
    onClose();
  };

  return (
    <div
      role="group"
      aria-label={t("storyMapBoard.cardMenu")}
      className="mt-1 space-y-2 rounded border border-gray-300 bg-white p-2 text-xs shadow-md dark:border-slate-600"
    >
      <form onSubmit={save} className="space-y-1">
        {card.storyId === null ? (
          <label className="block">
            {t("storyMapBoard.cardTitle")}
            <input
              className={inputClass}
              value={title}
              maxLength={STORY_MAP_TITLE_MAX}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
        ) : null}
        <label className="block">
          {t("storyMapBoard.cardNote")}
          <textarea
            className={inputClass}
            rows={2}
            value={note}
            maxLength={STORY_MAP_NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <button type="submit" className={buttonClass}>
          {t("storyMapBoard.save")}
        </button>
      </form>
      <div className="space-y-1">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={buttonClass}
            aria-expanded={panel === "link"}
            onClick={() => setPanel(panel === "link" ? null : "link")}
          >
            {card.storyId === null
              ? t("storyMapBoard.linkStory")
              : t("storyMapBoard.relinkStory")}
          </button>
          {card.storyId === null ? (
            <button
              type="button"
              className={buttonClass}
              aria-expanded={panel === "create"}
              onClick={() => setPanel(panel === "create" ? null : "create")}
            >
              {t("storyMapBoard.createStory")}
            </button>
          ) : null}
        </div>
        {panel === "link" ? (
          <StoryLinkPicker
            projectId={structure.map.projectId}
            mapId={structure.map.id}
            card={card}
            send={send}
            onClose={onClose}
          />
        ) : null}
        {panel === "create" ? (
          <StoryCreatePanel
            card={card}
            context={{
              mapTitle: structure.map.title,
              taskTitle:
                structure.tasks.find((task) => task.id === card.taskId)
                  ?.title ?? "",
              sliceTitle:
                structure.slices.find((slice) => slice.id === card.sliceId)
                  ?.title ?? null,
            }}
            send={send}
            onClose={onClose}
          />
        ) : null}
      </div>
      <form onSubmit={move} className="space-y-1">
        <label className="block">
          {t("storyMapBoard.moveTask")}
          <select
            className={inputClass}
            value={taskId}
            onChange={(event) => {
              setTaskId(event.target.value);
              setAfterId("");
            }}
          >
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {structure.activities.find((a) => a.id === task.activityId)
                  ?.title ?? ""}{" "}
                / {task.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          {t("storyMapBoard.moveSlice")}
          <select
            className={inputClass}
            value={sliceKey}
            onChange={(event) => {
              setSliceKey(event.target.value);
              setAfterId("");
            }}
          >
            {rows.map((row) => (
              <option key={row.key} value={row.key}>
                {row.slice?.title ?? t("storyMapBoard.unplanned")}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          {t("storyMapBoard.movePosition")}
          <select
            className={inputClass}
            value={afterId}
            onChange={(event) => setAfterId(event.target.value)}
          >
            <option value="">{t("storyMapBoard.positionFirst")}</option>
            {siblings.map((other) => (
              <option key={other.id} value={other.id}>
                {t("storyMapBoard.positionAfter", { title: cardLabel(other) })}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClass}>
          {t("storyMapBoard.move")}
        </button>
      </form>
      <div className="flex gap-1">
        <button
          type="button"
          className={dangerButtonClass}
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            send({ type: "deleteCard", cardId: card.id });
            onClose();
          }}
        >
          {confirmDelete
            ? t("storyMapBoard.deleteCardConfirm")
            : t("storyMapBoard.delete")}
        </button>
        <button type="button" className={buttonClass} onClick={onClose}>
          {t("storyMapBoard.cancel")}
        </button>
      </div>
    </div>
  );
}

export type StoryMapBoardProps = {
  structure: StoryMapStructure;
  editable: boolean;
  send: Send;
};

export function StoryMapBoard({
  structure,
  editable,
  send,
}: StoryMapBoardProps) {
  const { t } = useTranslation();
  const [menuCardId, setMenuCardId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const activities = [...structure.activities].sort(byPosition);
  const slices = [...structure.slices].sort(byPosition);
  const tasksOf = (activityId: string) =>
    structure.tasks
      .filter((task) => task.activityId === activityId)
      .sort(byPosition);
  const orderedTasks = activities.flatMap((activity) => tasksOf(activity.id));
  const rows: Row[] = [
    { key: UNPLANNED, sliceId: null, slice: null },
    ...slices.map((slice) => ({ key: slice.id, sliceId: slice.id, slice })),
  ];

  const cardCountOfTask = (taskId: string) =>
    structure.cards.filter((card) => card.taskId === taskId).length;
  const impactOfActivity = (activity: StoryMapActivity) => {
    const tasks = tasksOf(activity.id);
    const cards = tasks.reduce(
      (sum, task) => sum + cardCountOfTask(task.id),
      0,
    );
    return t("storyMapBoard.impactActivity", { tasks: tasks.length, cards });
  };

  const placeAt = (
    cardId: string,
    taskId: string,
    sliceId: string | null,
    afterCardId: string | null,
  ) => send({ type: "moveCard", cardId, taskId, sliceId, afterCardId });

  /** Alt+arrow moves the card between tasks (left/right) and rows (up/down). */
  const onCardKey = (event: KeyboardEvent, card: StoryMapCard) => {
    if (!editable || !event.altKey) return;
    const taskIndex = orderedTasks.findIndex((task) => task.id === card.taskId);
    const rowIndex = rows.findIndex((row) => row.sliceId === card.sliceId);
    let nextTask = taskIndex;
    let nextRow = rowIndex;
    if (event.key === "ArrowLeft") nextTask -= 1;
    else if (event.key === "ArrowRight") nextTask += 1;
    else if (event.key === "ArrowUp") nextRow -= 1;
    else if (event.key === "ArrowDown") nextRow += 1;
    else return;
    event.preventDefault();
    const task = orderedTasks[nextTask];
    const row = rows[nextRow];
    if (!task || !row) return;
    const target = cardsIn(structure, task.id, row.sliceId).filter(
      (other) => other.id !== card.id,
    );
    placeAt(card.id, task.id, row.sliceId, target.at(-1)?.id ?? null);
  };

  const onDrop = (
    taskId: string,
    sliceId: string | null,
    afterCardId: string | null,
  ) => {
    if (dragId === null) return;
    const dragged = structure.cards.find((card) => card.id === dragId);
    setDragId(null);
    if (!dragged || dragged.id === afterCardId) return;
    placeAt(dragged.id, taskId, sliceId, afterCardId);
  };

  if (activities.length === 0 && !editable) {
    return <p className="text-sm text-gray-600">{t("storyMapBoard.empty")}</p>;
  }

  return (
    <section aria-label={t("storyMapBoard.title")} className="mb-6">
      <h2 className="mb-2 text-base font-semibold text-gray-900 dark:text-slate-100">
        {t("storyMapBoard.title")}
      </h2>
      <div className="max-h-[75vh] overflow-auto rounded-lg border border-gray-300 shadow-sm dark:border-slate-700">
        <table className="border-separate border-spacing-0 text-sm text-gray-900 dark:text-slate-100">
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-30 min-w-40 border-b border-r border-gray-300 bg-gray-100 p-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-slate-700 dark:text-slate-300"
              >
                {t("storyMapBoard.activities")}
              </th>
              {activities.map((activity, index) => {
                const tasks = tasksOf(activity.id);
                return (
                  <th
                    key={activity.id}
                    scope="colgroup"
                    colSpan={Math.max(tasks.length, 1)}
                    className="group/header min-w-48 border-b border-r border-t-4 border-gray-300 border-t-blue-500 bg-gray-100 p-2 text-left align-top dark:border-slate-700 dark:border-t-blue-400"
                  >
                    <div className="text-sm font-semibold">
                      {activity.title}
                    </div>
                    {editable ? (
                      <HeaderControls
                        title={activity.title}
                        kind={t("storyMapBoard.kindActivity")}
                        canMovePrev={index > 0}
                        canMoveNext={index < activities.length - 1}
                        deleteImpact={impactOfActivity(activity)}
                        onRename={(title) =>
                          send({
                            type: "renameActivity",
                            activityId: activity.id,
                            title,
                          })
                        }
                        onMove={(direction) => {
                          const target = activities[index + direction];
                          if (!target) return;
                          send({
                            type: "moveActivity",
                            activityId: activity.id,
                            afterActivityId:
                              direction === -1
                                ? (activities[index - 2]?.id ?? null)
                                : target.id,
                          });
                        }}
                        onDelete={() =>
                          send({
                            type: "deleteActivity",
                            activityId: activity.id,
                          })
                        }
                      />
                    ) : null}
                  </th>
                );
              })}
              {editable ? (
                <th className="min-w-48 border-b border-gray-300 bg-gray-100 p-2 text-left align-top dark:border-slate-700">
                  <InlineAdd
                    label={t("storyMapBoard.addActivity")}
                    onAdd={(title) =>
                      send({
                        type: "addActivity",
                        title,
                        afterActivityId: activities.at(-1)?.id ?? null,
                      })
                    }
                  />
                </th>
              ) : null}
            </tr>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-30 border-b border-r border-gray-300 bg-gray-100 p-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-slate-700 dark:text-slate-300"
              >
                {t("storyMapBoard.tasks")}
              </th>
              {activities.flatMap((activity) => {
                const tasks = tasksOf(activity.id);
                const addTask = editable ? (
                  <InlineAdd
                    label={t("storyMapBoard.addTask")}
                    onAdd={(title) =>
                      send({
                        type: "addTask",
                        activityId: activity.id,
                        title,
                        afterTaskId: tasks.at(-1)?.id ?? null,
                      })
                    }
                  />
                ) : null;
                if (tasks.length === 0) {
                  return [
                    <th
                      key={`${activity.id}-empty`}
                      scope="col"
                      className="border-b border-r border-gray-300 bg-gray-50 p-2 text-left align-top dark:border-slate-700"
                    >
                      {addTask}
                    </th>,
                  ];
                }
                return tasks.map((task, index) => (
                  <th
                    key={task.id}
                    scope="col"
                    className="group/header min-w-48 border-b border-r border-t-2 border-gray-300 border-t-indigo-400 bg-gray-50 p-2 text-left align-top dark:border-slate-700 dark:border-t-indigo-300"
                  >
                    <div className="font-medium">{task.title}</div>
                    {editable ? (
                      <>
                        <HeaderControls
                          title={task.title}
                          kind={t("storyMapBoard.kindTask")}
                          canMovePrev={index > 0}
                          canMoveNext={index < tasks.length - 1}
                          deleteImpact={t("storyMapBoard.impactTask", {
                            cards: cardCountOfTask(task.id),
                          })}
                          onRename={(title) =>
                            send({ type: "renameTask", taskId: task.id, title })
                          }
                          onMove={(direction) => {
                            const target = tasks[index + direction];
                            if (!target) return;
                            send({
                              type: "moveTask",
                              taskId: task.id,
                              activityId: activity.id,
                              afterTaskId:
                                direction === -1
                                  ? (tasks[index - 2]?.id ?? null)
                                  : target.id,
                            });
                          }}
                          onDelete={() =>
                            send({ type: "deleteTask", taskId: task.id })
                          }
                        />
                        {index === tasks.length - 1 ? (
                          <div className="mt-1">{addTask}</div>
                        ) : null}
                      </>
                    ) : null}
                  </th>
                ));
              })}
              {editable ? (
                <th className="border-b border-gray-300 bg-gray-50 dark:border-slate-700" />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  className={`group/header sticky left-0 z-10 border-b border-r border-l-4 border-gray-300 p-2 text-left align-top dark:border-slate-700 ${row.slice ? "border-l-emerald-500 bg-gray-50" : "border-l-gray-300 bg-gray-100 dark:border-l-slate-500"}`}
                >
                  <div
                    className={
                      row.slice
                        ? "font-medium"
                        : "font-medium italic text-gray-600 dark:text-slate-300"
                    }
                  >
                    {row.slice?.title ?? t("storyMapBoard.unplanned")}
                  </div>
                  {row.slice && editable ? (
                    <HeaderControls
                      title={row.slice.title}
                      kind={t("storyMapBoard.kindSlice")}
                      canMovePrev={rowIndex > 1}
                      canMoveNext={rowIndex < rows.length - 1}
                      deleteImpact={t("storyMapBoard.impactSlice")}
                      onRename={(title) =>
                        send({
                          type: "renameSlice",
                          sliceId: row.slice!.id,
                          title,
                        })
                      }
                      onMove={(direction) => {
                        const index = slices.findIndex(
                          (s) => s.id === row.slice!.id,
                        );
                        const target = slices[index + direction];
                        if (!target) return;
                        send({
                          type: "moveSlice",
                          sliceId: row.slice!.id,
                          afterSliceId:
                            direction === -1
                              ? (slices[index - 2]?.id ?? null)
                              : target.id,
                        });
                      }}
                      onDelete={() =>
                        send({ type: "deleteSlice", sliceId: row.slice!.id })
                      }
                    />
                  ) : null}
                </th>
                {activities.flatMap((activity) => {
                  const tasks = tasksOf(activity.id);
                  if (tasks.length === 0) {
                    return [
                      <td
                        key={`${activity.id}-empty`}
                        className="border-b border-r border-gray-200 bg-gray-50/50 dark:border-slate-700"
                      />,
                    ];
                  }
                  return tasks.map((task) => {
                    const cards = cardsIn(structure, task.id, row.sliceId);
                    return (
                      <td
                        key={task.id}
                        data-testid={`cell-${task.id}-${row.key || "unplanned"}`}
                        className={`group/cell border-b border-r border-gray-200 p-1.5 align-top dark:border-slate-700 ${row.slice ? "" : "bg-gray-50/70 dark:bg-slate-900/40"}`}
                        onDragOver={(event) => {
                          if (editable && dragId) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          onDrop(
                            task.id,
                            row.sliceId,
                            cards.at(-1)?.id ?? null,
                          );
                        }}
                      >
                        <ul className="space-y-1">
                          {cards.map((card) => (
                            <li
                              key={card.id}
                              draggable={editable}
                              onDragStart={() => setDragId(card.id)}
                              onDragEnd={() => setDragId(null)}
                              onDragOver={(event) => {
                                if (editable && dragId) event.preventDefault();
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onDrop(task.id, row.sliceId, card.id);
                              }}
                              className={`group/card rounded border border-l-4 border-gray-300 bg-white p-2 shadow-sm dark:border-slate-600 ${cardTone(card)}`}
                            >
                              <div
                                tabIndex={editable ? 0 : undefined}
                                aria-keyshortcuts={
                                  editable
                                    ? "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
                                    : undefined
                                }
                                onKeyDown={(event) => onCardKey(event, card)}
                                className="break-words rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                              >
                                {card.storyState === "missing" ? (
                                  <>
                                    <span className="text-red-700 dark:text-red-300">
                                      {t("storyMapBoard.storyMissing")}
                                    </span>
                                    <p className="mt-1 text-xs text-gray-600">
                                      {t("storyMapBoard.storyMissingHelp")}
                                    </p>
                                  </>
                                ) : card.story ? (
                                  <>
                                    <Link
                                      className="font-medium text-blue-700 underline dark:text-blue-300"
                                      aria-label={t("storyMapBoard.openStory", {
                                        number: card.story.number,
                                      })}
                                      to={projectStoryDetailPath(
                                        structure.map.projectId,
                                        String(card.story.number),
                                      )}
                                    >
                                      #{card.story.number} {card.story.title}
                                    </Link>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-600">
                                      <span className="rounded bg-gray-100 px-1 py-px font-medium dark:bg-slate-800">
                                        {card.story.isIcebox
                                          ? "Icebox"
                                          : card.story.status}
                                      </span>
                                      <span className="rounded bg-gray-100 px-1 py-px dark:bg-slate-800">
                                        {card.story.type}
                                      </span>
                                      {card.story.storyPoint !== null ? (
                                        <span>
                                          {t("storyMapBoard.storyEstimate", {
                                            point: card.story.storyPoint,
                                          })}
                                        </span>
                                      ) : null}
                                    </p>
                                  </>
                                ) : card.storyId !== null ? (
                                  <span>{t("storyMapBoard.storyCard")}</span>
                                ) : (
                                  <span>{card.ideaTitle}</span>
                                )}
                                {card.note ? (
                                  <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600">
                                    {card.note}
                                  </p>
                                ) : null}
                              </div>
                              {editable ? (
                                menuCardId === card.id ? (
                                  <CardMenu
                                    card={card}
                                    structure={structure}
                                    tasks={orderedTasks}
                                    rows={rows}
                                    send={send}
                                    onClose={() => setMenuCardId(null)}
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    className={`mt-1 ${buttonClass} ${cardRevealClass}`}
                                    aria-label={`${t("storyMapBoard.cardMenu")}: ${card.story ? `#${card.story.number}` : (card.ideaTitle ?? t("storyMapBoard.storyCard"))}`}
                                    onClick={() => setMenuCardId(card.id)}
                                  >
                                    {t("storyMapBoard.cardMenu")}
                                  </button>
                                )
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        {editable ? (
                          <div className="mt-1.5">
                            <InlineAdd
                              label={`${t("storyMapBoard.addCard")}`}
                              onAdd={(title) =>
                                send({
                                  type: "addCard",
                                  taskId: task.id,
                                  sliceId: row.sliceId,
                                  afterCardId: cards.at(-1)?.id ?? null,
                                  ideaTitle: title,
                                })
                              }
                            />
                          </div>
                        ) : null}
                      </td>
                    );
                  });
                })}
                {editable ? (
                  <td className="border-b border-gray-200 dark:border-slate-700" />
                ) : null}
              </tr>
            ))}
            {editable ? (
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r border-gray-300 bg-gray-50 p-2 text-left dark:border-slate-700"
                >
                  <InlineAdd
                    label={t("storyMapBoard.addSlice")}
                    onAdd={(title) =>
                      send({
                        type: "addSlice",
                        title,
                        afterSliceId: slices.at(-1)?.id ?? null,
                      })
                    }
                  />
                </th>
                <td
                  colSpan={
                    Math.max(orderedTasks.length, activities.length, 1) + 1
                  }
                />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-600 dark:text-slate-300">
        {t("storyMapBoard.keyboardHint")}
      </p>
    </section>
  );
}
