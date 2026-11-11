import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

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

type Send = (command: unknown) => void;

const byPosition = <T extends { position: number; id: string }>(a: T, b: T) =>
  a.position - b.position || a.id.localeCompare(b.id);

const buttonClass =
  "rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const inputClass =
  "w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900";

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
        className={buttonClass}
        onClick={() => setOpen(true)}
      >
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
        <p className="mb-1 text-xs text-gray-800">
          {t("storyMapBoard.deleteConfirm", { kind, title })}
          {deleteImpact ? ` ${deleteImpact}` : ""}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            className={`${buttonClass} border-red-400 text-red-700`}
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
    <div className="mt-1 flex flex-wrap gap-1">
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

  const sliceId = sliceKey === UNPLANNED ? null : sliceKey;
  const siblings = cardsIn(structure, taskId, sliceId).filter(
    (other) => other.id !== card.id,
  );
  const cardLabel = (other: StoryMapCard) =>
    other.ideaTitle ?? t("storyMapBoard.storyCard");

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
      ...(card.storyId === null ? { ideaTitle: title } : {}),
      note,
    });
    onClose();
  };

  return (
    <div
      role="group"
      aria-label={t("storyMapBoard.cardMenu")}
      className="mt-1 space-y-2 rounded border border-gray-300 bg-white p-2 text-xs"
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
          className={`${buttonClass} border-red-400 text-red-700`}
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
      <h2 className="mb-2 text-base font-semibold text-gray-900">
        {t("storyMapBoard.title")}
      </h2>
      <div className="max-h-[70vh] overflow-auto rounded border border-gray-300">
        <table className="border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-30 min-w-40 border-b border-r border-gray-300 bg-gray-100 p-2 text-left"
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
                    className="min-w-48 border-b border-r border-gray-300 bg-gray-100 p-2 text-left align-top"
                  >
                    <div className="font-semibold">{activity.title}</div>
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
                <th className="min-w-48 border-b border-gray-300 bg-gray-100 p-2 text-left align-top">
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
                className="sticky left-0 z-30 border-b border-r border-gray-300 bg-gray-100 p-2 text-left"
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
                      className="border-b border-r border-gray-300 bg-gray-50 p-2 text-left align-top"
                    >
                      {addTask}
                    </th>,
                  ];
                }
                return tasks.map((task, index) => (
                  <th
                    key={task.id}
                    scope="col"
                    className="border-b border-r border-gray-300 bg-gray-50 p-2 text-left align-top"
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
                <th className="border-b border-gray-300 bg-gray-50" />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-r border-gray-300 bg-gray-50 p-2 text-left align-top"
                >
                  <div className="font-medium">
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
                        className="border-b border-r border-gray-200 bg-gray-50/50"
                      />,
                    ];
                  }
                  return tasks.map((task) => {
                    const cards = cardsIn(structure, task.id, row.sliceId);
                    return (
                      <td
                        key={task.id}
                        data-testid={`cell-${task.id}-${row.key || "unplanned"}`}
                        className="border-b border-r border-gray-200 p-2 align-top"
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
                              className="rounded border border-gray-300 bg-white p-2 shadow-sm"
                            >
                              <div
                                tabIndex={editable ? 0 : undefined}
                                aria-keyshortcuts={
                                  editable
                                    ? "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
                                    : undefined
                                }
                                onKeyDown={(event) => onCardKey(event, card)}
                                className="break-words"
                              >
                                {card.storyState === "missing" ? (
                                  <span className="text-gray-600">
                                    {t("storyMapBoard.storyMissing")}
                                  </span>
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
                                    className={`mt-1 ${buttonClass}`}
                                    aria-label={`${t("storyMapBoard.cardMenu")}: ${card.ideaTitle ?? t("storyMapBoard.storyCard")}`}
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
                          <div className="mt-1">
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
                {editable ? <td className="border-b border-gray-200" /> : null}
              </tr>
            ))}
            {editable ? (
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r border-gray-300 bg-gray-50 p-2 text-left"
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
      <p className="mt-2 text-xs text-gray-600">
        {t("storyMapBoard.keyboardHint")}
      </p>
    </section>
  );
}
