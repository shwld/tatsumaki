import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Bug,
  ChevronDown,
  ChevronUp,
  Link2,
  Link2Off,
  Settings,
  Tag,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { PANEL_LABELS, type PanelType } from "../lib/panel-visibility";
import {
  calculateTotalPoints,
  groupStoriesByIteration,
} from "../lib/story-panel-grouping";
import { useToast } from "../contexts/toast-context";
import { useStoryPatch } from "../hooks/use-story-patch";
import { shouldShowPointEstimation } from "../lib/story-estimation";
import { getWorkflowActions } from "../lib/story-status";
import type { Iteration } from "../types/iteration";
import type { IterationStartDay, SprintDuration } from "../types/project";
import type { ProjectLabel } from "../types/project-label";
import {
  DEFAULT_STORY_POINTS,
  STORY_TYPES,
  type Story,
  type StoryPoint,
  type StoryStatus,
  type StoryType,
} from "../types/story";
import { StoryLabelChips } from "./story-label-chips";
import { StoryTitleEditPopoverFields } from "./story-title-edit-popover-fields";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export type StoryInlineEditContext = {
  onStoryUpdated: (story: Story) => void;
  pointScale: StoryPoint[];
  estimateBugs: boolean;
  estimateChores: boolean;
};

const CARD_EDIT_TYPES = STORY_TYPES.filter((t) => t !== "release");

const StoryCardWorkflowActions = memo(function StoryCardWorkflowActions({
  story,
  workflowActions,
  onStatusChange,
}: {
  story: Story;
  workflowActions: ReturnType<typeof getWorkflowActions>;
  onStatusChange: (story: Story, status: StoryStatus) => void;
}) {
  return (
    <>
      {workflowActions.map((action) => (
        <button
          key={action.target}
          type="button"
          className={`inline-flex shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
            action.disabled
              ? "cursor-not-allowed bg-gray-100 text-gray-400"
              : action.variant === "primary"
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : action.variant === "danger"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
          disabled={action.disabled}
          title={action.disabledReason ?? undefined}
          onClick={() => onStatusChange(story, action.target)}
        >
          {action.label}
        </button>
      ))}
    </>
  );
});

function shouldIgnoreHeaderToggleClick(target: EventTarget | null): boolean {
  /** Lucide icons render as SVG (`SVGElement`); clicks must still resolve `closest("button")`. */
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("a, button, input, select, textarea, label"));
}

type StoryCardProps = {
  story: Story;
  isExpanded?: boolean;
  onToggleExpand?: (storyId: string) => void;
  selectedStoryIds?: Set<string>;
  onStatusChange?: (story: Story, targetStatus: StoryStatus) => void;
  onSelect?: (storyId: string, selected: boolean) => void;
  dragHandleProps?: Record<string, unknown>;
  expandedContent?: ReactNode;
  subHeaderContent?: ReactNode;
  storyInlineEdit?: StoryInlineEditContext | null;
  projectLabels?: ProjectLabel[];
  /** Tailwind `top-*` when not using `--story-sticky-offset` (Icebox uses `top-0`). */
  stickyHeaderTopClassName?: string;
  /** When true, sticky header uses `style={{ top: "var(--story-sticky-offset)" }}` from the parent iteration `<section>`. */
  stickyHeaderTopUsesIterationCssVar?: boolean;
};

const STORY_TYPE_ICONS = {
  feature: <BookOpen className="h-3.5 w-3.5" />,
  bug: <Bug className="h-3.5 w-3.5" />,
  chore: <Settings className="h-3.5 w-3.5" />,
  release: <Tag className="h-3.5 w-3.5" />,
} as const;

/** Sticky z-order inside panel: panel chrome → sprint row → story accordion (only the latter two share one scroll body). */
const Z_PANEL_HEADER_STICKY = "z-30";
const Z_ITERATION_ROW_STICKY = "z-20";
const Z_STORY_CARD_HEADER_STICKY = "z-10";

const StoryBlockStateBadges = memo(function StoryBlockStateBadges({
  story,
}: {
  story: Story;
}) {
  const { t } = useTranslation();
  if (!story.isBlocked && !story.isBlocking) {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {story.isBlocked ? (
        <span
          className="inline-flex text-red-500"
          title={t("storyPanel.blocked")}
          aria-label={t("storyPanel.blocked")}
        >
          <Link2Off className="h-3.5 w-3.5" />
        </span>
      ) : null}
      {story.isBlocking ? (
        <span
          className="inline-flex text-amber-500"
          title={t("storyPanel.blocking")}
          aria-label={t("storyPanel.blocking")}
        >
          <Link2 className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </span>
  );
});

async function copyStoryNumberToClipboard(storyNumber: number) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard API is unavailable");
  }
  await navigator.clipboard.writeText(String(storyNumber));
}

const StoryCardRelease = memo(function StoryCardRelease({
  story,
  onToggleExpand,
  dragHandleProps,
  expandedContent,
}: Pick<
  StoryCardProps,
  "story" | "onToggleExpand" | "dragHandleProps" | "expandedContent"
>) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded border border-purple-300 bg-purple-50 px-3 py-1.5 dark:border-purple-700 dark:bg-purple-950/30"
      data-testid={`panel-story-${story.id}`}
    >
      <div className="flex items-center gap-2">
        {dragHandleProps ? (
          <button
            type="button"
            aria-label={`Reorder ${story.title}`}
            className="inline-flex h-5 w-5 shrink-0 cursor-grab items-center justify-center text-purple-400 hover:text-purple-600 active:cursor-grabbing dark:text-purple-300 dark:hover:text-purple-200"
            {...dragHandleProps}
          >
            :::
          </button>
        ) : null}
        <span className="flex items-center gap-1 text-sm font-medium text-purple-700 dark:text-purple-200">
          <Tag className="h-3.5 w-3.5 shrink-0" />
          {story.title}
        </span>
        {story.releaseDate ? (
          <span className="text-xs text-purple-500 dark:text-purple-300">
            ({story.releaseDate})
          </span>
        ) : null}
        <button
          type="button"
          className="ml-auto rounded border border-purple-300 bg-white px-2 py-0.5 text-xs text-purple-700 hover:bg-purple-50 dark:border-purple-500 dark:bg-slate-900 dark:text-purple-200 dark:hover:bg-purple-900/40"
          onClick={() => onToggleExpand?.(story.id)}
          aria-label={t("storyPanel.editReleaseMarker")}
        >
          {t("storyPanel.details")}
        </button>
      </div>
      {expandedContent ? (
        <div className="mt-1 border-t border-purple-200 pt-1 dark:border-purple-800">
          {expandedContent}
        </div>
      ) : null}
    </div>
  );
});

const StoryCardAccepted = memo(function StoryCardAccepted({
  story,
  isExpanded = false,
  onToggleExpand,
  expandedContent,
  subHeaderContent,
  stickyHeaderTopClassName = "top-0",
  stickyHeaderTopUsesIterationCssVar = false,
}: Omit<
  StoryCardProps,
  | "storyInlineEdit"
  | "selectedStoryIds"
  | "onStatusChange"
  | "onSelect"
  | "dragHandleProps"
>) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const handleHeaderClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (shouldIgnoreHeaderToggleClick(e.target)) return;
      onToggleExpand?.(story.id);
    },
    [onToggleExpand, story.id],
  );

  const handleHeaderKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      onToggleExpand?.(story.id);
    },
    [onToggleExpand, story.id],
  );

  return (
    <div
      className={`rounded-md border shadow-sm ${
        isExpanded
          ? "border-emerald-400 bg-emerald-50 shadow"
          : "border-emerald-200 bg-emerald-50 hover:border-emerald-300 hover:shadow"
      }`}
      data-testid={`panel-story-${story.id}`}
    >
      <div
        className={`sticky ${Z_STORY_CARD_HEADER_STICKY} rounded-t-md ${stickyHeaderTopClassName} bg-emerald-50`}
        style={
          stickyHeaderTopUsesIterationCssVar
            ? ({
                top: "var(--story-sticky-offset)",
              } satisfies CSSProperties)
            : undefined
        }
      >
        <div
          className="cursor-pointer px-3 py-2"
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onClick={handleHeaderClick}
          onKeyDown={handleHeaderKeyDown}
        >
          <div
            className="min-w-0 whitespace-normal break-words text-sm font-semibold text-gray-900"
            data-testid={`story-header-accepted-meta-${story.id}`}
          >
            <span
              className="mr-2 inline-flex align-middle text-gray-500"
              title={story.type}
            >
              {STORY_TYPE_ICONS[story.type]}
            </span>
            <span className="mr-2 inline rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 align-middle">
              {story.storyPoint === null ? "\u2014" : story.storyPoint}
            </span>
            <button
              type="button"
              className="mr-1.5 inline rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200 align-middle"
              aria-label={t("storyPanel.copyStoryNumber", {
                storyNumber: story.storyNumber,
              })}
              onClick={(event) => {
                event.stopPropagation();
                void copyStoryNumberToClipboard(story.storyNumber)
                  .then(() => {
                    showToast("success", t("storyPanel.copyNumberSuccess"));
                  })
                  .catch(() => {
                    showToast("error", t("storyPanel.copyNumberFailed"));
                  });
              }}
            >
              #{story.storyNumber}
            </button>
            <span
              className="whitespace-normal break-words"
              data-testid={`story-header-title-row-${story.id}`}
            >
              {story.title}
            </span>
            <span className="ml-2 inline-flex align-middle">
              <StoryBlockStateBadges story={story} />
            </span>
          </div>
        </div>
        {isExpanded && subHeaderContent ? (
          <div className="border-t border-gray-100">{subHeaderContent}</div>
        ) : null}
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${
          isExpanded
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          {expandedContent ? (
            <div className="border-t border-gray-200">{expandedContent}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

const StoryCardStaticMeta = memo(function StoryCardStaticMeta({
  story,
  isExpanded = false,
  onToggleExpand,
  selectedStoryIds,
  onStatusChange,
  onSelect,
  dragHandleProps,
  expandedContent,
  subHeaderContent,
  projectLabels,
  stickyHeaderTopClassName = "top-0",
  stickyHeaderTopUsesIterationCssVar = false,
}: Omit<StoryCardProps, "storyInlineEdit">) {
  const { t } = useTranslation();
  const workflowActions = getWorkflowActions(
    story.status,
    story.storyPoint,
    story.type,
  );
  const isSelected = selectedStoryIds?.has(story.id) ?? false;

  const handleHeaderClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (shouldIgnoreHeaderToggleClick(e.target)) return;
      onToggleExpand?.(story.id);
    },
    [onToggleExpand, story.id],
  );

  const handleHeaderKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      onToggleExpand?.(story.id);
    },
    [onToggleExpand, story.id],
  );

  return (
    <div
      className={`rounded-md border shadow-sm ${
        isExpanded
          ? "border-blue-400 bg-white shadow"
          : "border-gray-200 bg-white hover:border-blue-300 hover:shadow"
      }`}
      data-testid={`panel-story-${story.id}`}
    >
      <div
        className={`sticky ${Z_STORY_CARD_HEADER_STICKY} rounded-t-md ${stickyHeaderTopClassName} bg-white`}
        style={
          stickyHeaderTopUsesIterationCssVar
            ? ({
                top: "var(--story-sticky-offset)",
              } satisfies CSSProperties)
            : undefined
        }
      >
        <div
          className="cursor-pointer px-3 py-2"
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onClick={handleHeaderClick}
          onKeyDown={handleHeaderKeyDown}
        >
          <div className="flex flex-wrap items-center gap-2">
            {onSelect ? (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => onSelect(story.id, e.target.checked)}
                className="h-3.5 w-3.5"
                aria-label={t("storyPanel.selectStory", {
                  title: story.title,
                })}
              />
            ) : null}
            {dragHandleProps ? (
              <button
                type="button"
                aria-label={`Reorder ${story.title}`}
                className="inline-flex h-5 w-5 shrink-0 cursor-grab items-center justify-center text-gray-400 hover:text-gray-600 active:cursor-grabbing"
                {...dragHandleProps}
              >
                :::
              </button>
            ) : null}
            <span className="shrink-0 text-gray-500" title={story.type}>
              {STORY_TYPE_ICONS[story.type]}
            </span>
            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
              {story.storyPoint === null ? "\u2014" : story.storyPoint}
            </span>
            {workflowActions.length > 0 && onStatusChange ? (
              <StoryCardWorkflowActions
                story={story}
                workflowActions={workflowActions}
                onStatusChange={onStatusChange}
              />
            ) : null}
            <StoryBlockStateBadges story={story} />
            <span className="ml-auto shrink-0 text-gray-400" aria-hidden>
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>
          </div>
          <div
            className="mt-1 min-w-0 whitespace-normal break-words text-sm font-semibold text-gray-900"
            data-testid={`story-header-title-row-${story.id}`}
          >
            <button
              type="button"
              className="mr-1.5 inline rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
              aria-label={t("storyPanel.copyStoryNumber", {
                storyNumber: story.storyNumber,
              })}
              onClick={(event) => {
                event.stopPropagation();
                void copyStoryNumberToClipboard(story.storyNumber).catch(
                  () => {},
                );
              }}
            >
              #{story.storyNumber}
            </button>
            <span>{story.title}</span>
          </div>
          <StoryLabelChips
            labels={story.labels}
            projectLabels={projectLabels}
          />
        </div>
        {isExpanded && subHeaderContent ? (
          <div className="border-t border-gray-100">{subHeaderContent}</div>
        ) : null}
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${
          isExpanded
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          {expandedContent ? (
            <div className="border-t border-gray-200">{expandedContent}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

const StoryCardWithInlineEdit = memo(function StoryCardWithInlineEdit({
  story,
  storyInlineEdit,
  isExpanded = false,
  onToggleExpand,
  selectedStoryIds,
  onStatusChange,
  onSelect,
  dragHandleProps,
  expandedContent,
  subHeaderContent,
  projectLabels,
  stickyHeaderTopClassName = "top-0",
  stickyHeaderTopUsesIterationCssVar = false,
}: Omit<StoryCardProps, "storyInlineEdit"> & {
  storyInlineEdit: StoryInlineEditContext;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { patchStory, isSaving } = useStoryPatch(
    story.projectId,
    String(story.storyNumber),
    storyInlineEdit.onStoryUpdated,
    { getOptimisticBaseStory: () => story },
  );
  const [titlePopoverOpen, setTitlePopoverOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(story.title);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitleDraft(story.title);
  }, [story.id, story.title]);

  const workflowActions = getWorkflowActions(
    story.status,
    story.storyPoint,
    story.type,
  );
  const isSelected = selectedStoryIds?.has(story.id) ?? false;

  const pointScale =
    storyInlineEdit.pointScale.length > 0
      ? storyInlineEdit.pointScale
      : [...DEFAULT_STORY_POINTS];
  const showPointEstimation = shouldShowPointEstimation(
    story.type,
    storyInlineEdit.estimateBugs,
    storyInlineEdit.estimateChores,
  );

  const handleHeaderClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (shouldIgnoreHeaderToggleClick(e.target)) return;
      onToggleExpand?.(story.id);
    },
    [onToggleExpand, story.id],
  );

  const handleHeaderKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      onToggleExpand?.(story.id);
    },
    [onToggleExpand, story.id],
  );

  const changeType = useCallback(
    async (nextType: StoryType) => {
      if (nextType === story.type) return;
      await patchStory({ type: nextType });
    },
    [patchStory, story.type],
  );

  const handleTitleSave = useCallback(async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === story.title) {
      setTitlePopoverOpen(false);
      return;
    }
    await patchStory({ title: trimmed });
    setTitlePopoverOpen(false);
  }, [titleDraft, story.title, patchStory]);

  const busy = isSaving;

  return (
    <div
      className={`rounded-md border shadow-sm ${
        isExpanded
          ? "border-blue-400 bg-white shadow"
          : "border-gray-200 bg-white hover:border-blue-300 hover:shadow"
      }`}
      data-testid={`panel-story-${story.id}`}
    >
      <div
        className={`sticky ${Z_STORY_CARD_HEADER_STICKY} rounded-t-md ${stickyHeaderTopClassName} bg-white`}
        style={
          stickyHeaderTopUsesIterationCssVar
            ? ({
                top: "var(--story-sticky-offset)",
              } satisfies CSSProperties)
            : undefined
        }
      >
        <div
          className="cursor-pointer px-3 py-2"
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onClick={handleHeaderClick}
          onKeyDown={handleHeaderKeyDown}
        >
          <div className="flex flex-wrap items-center gap-2">
            {onSelect ? (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => onSelect(story.id, e.target.checked)}
                className="h-3.5 w-3.5"
                aria-label={t("storyPanel.selectStory", {
                  title: story.title,
                })}
              />
            ) : null}
            {dragHandleProps ? (
              <button
                type="button"
                aria-label={`Reorder ${story.title}`}
                className="inline-flex h-5 w-5 shrink-0 cursor-grab items-center justify-center text-gray-400 hover:text-gray-600 active:cursor-grabbing"
                {...dragHandleProps}
              >
                :::
              </button>
            ) : null}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title={t("storyPanel.changeType")}
                  className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                  disabled={busy}
                  aria-label={t("storyPanel.changeType")}
                >
                  {STORY_TYPE_ICONS[story.type]}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <p className="mb-1.5 text-xs font-medium text-gray-600">
                  {t("storyPanel.type")}
                </p>
                <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                  {CARD_EDIT_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={busy || story.type === t}
                      className={`rounded px-2 py-1 text-left text-xs ${
                        story.type === t
                          ? "bg-blue-100 font-medium text-blue-800"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                      onClick={() => {
                        void changeType(t);
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            {showPointEstimation ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title={t("storyPanel.changePoint")}
                    className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                    disabled={busy}
                    aria-label={t("storyPanel.changePoint")}
                  >
                    {story.storyPoint === null ? "\u2014" : story.storyPoint}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
                  <p className="mb-1.5 text-xs font-medium text-gray-600">
                    {t("storyPanel.point")}
                  </p>
                  <div className="flex max-w-[220px] flex-wrap gap-1">
                    {pointScale.map((pt) => (
                      <button
                        key={pt}
                        type="button"
                        className={`rounded px-2 py-0.5 text-xs ${
                          story.storyPoint === pt
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        disabled={busy}
                        onClick={() => void patchStory({ storyPoint: pt })}
                      >
                        {pt}
                      </button>
                    ))}
                    {story.storyPoint !== null ? (
                      <button
                        type="button"
                        className="rounded px-2 py-0.5 text-xs text-gray-400 hover:text-gray-600"
                        disabled={busy}
                        onClick={() => void patchStory({ storyPoint: null })}
                      >
                        &times;
                      </button>
                    ) : null}
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                {story.storyPoint === null ? "\u2014" : story.storyPoint}
              </span>
            )}
            {workflowActions.length > 0 && onStatusChange ? (
              <StoryCardWorkflowActions
                story={story}
                workflowActions={workflowActions}
                onStatusChange={onStatusChange}
              />
            ) : null}
            <StoryBlockStateBadges story={story} />
            <span className="ml-auto shrink-0 text-gray-400" aria-hidden>
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>
          </div>
          <Popover
            open={titlePopoverOpen}
            onOpenChange={(open) => {
              setTitlePopoverOpen(open);
              if (open) {
                setTitleDraft(story.title);
                queueMicrotask(() => titleInputRef.current?.select());
              }
            }}
          >
            <PopoverTrigger asChild>
              <div
                className="mt-1 min-w-0 whitespace-normal break-words text-sm font-semibold text-gray-900"
                data-testid={`story-header-title-row-${story.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <button
                  type="button"
                  className="mr-1.5 inline rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                  aria-label={t("storyPanel.copyStoryNumber", {
                    storyNumber: story.storyNumber,
                  })}
                  onClick={(event) => {
                    event.stopPropagation();
                    void copyStoryNumberToClipboard(story.storyNumber)
                      .then(() => {
                        showToast("success", t("storyPanel.copyNumberSuccess"));
                      })
                      .catch(() => {
                        showToast("error", t("storyPanel.copyNumberFailed"));
                      });
                  }}
                >
                  #{story.storyNumber}
                </button>
                <span
                  className="whitespace-normal break-words align-middle"
                  title={t("storyPanel.editTitle")}
                >
                  {story.title}
                </span>
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="start">
              <StoryTitleEditPopoverFields
                titleDraft={titleDraft}
                onTitleDraftChange={setTitleDraft}
                originalTitle={story.title}
                isSaving={isSaving}
                inputRef={titleInputRef}
                onSave={() => void handleTitleSave()}
                onCancel={() => setTitlePopoverOpen(false)}
              />
            </PopoverContent>
          </Popover>
          <StoryLabelChips
            labels={story.labels}
            projectLabels={projectLabels}
          />
        </div>
        {isExpanded && subHeaderContent ? (
          <div className="border-t border-gray-100">{subHeaderContent}</div>
        ) : null}
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${
          isExpanded
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          {expandedContent ? (
            <div className="border-t border-gray-200">{expandedContent}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

const StoryCard = memo(function StoryCard(props: StoryCardProps) {
  const { storyInlineEdit, ...rest } = props;
  if (props.story.type === "release") {
    return (
      <StoryCardRelease
        story={props.story}
        onToggleExpand={props.onToggleExpand}
        dragHandleProps={props.dragHandleProps}
        expandedContent={props.expandedContent}
      />
    );
  }
  if (props.story.status === "Accepted") {
    if (storyInlineEdit && props.isExpanded) {
      return (
        <StoryCardWithInlineEdit {...rest} storyInlineEdit={storyInlineEdit} />
      );
    }
    return <StoryCardAccepted {...rest} />;
  }
  if (storyInlineEdit) {
    return (
      <StoryCardWithInlineEdit {...rest} storyInlineEdit={storyInlineEdit} />
    );
  }
  return <StoryCardStaticMeta {...rest} />;
});

type SortableStoryItemProps = Omit<StoryCardProps, "dragHandleProps">;

const SortableStoryItem = memo(function SortableStoryItem({
  story,
  ...cardProps
}: SortableStoryItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: story.id });

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? "opacity-50" : ""}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <StoryCard
        story={story}
        {...cardProps}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </li>
  );
});

type GroupHeaderDroppableProps = {
  dropZoneId: string;
  children: ReactNode;
  /** Report sticky wrapper height so story `top` matches the sprint row exactly. */
  onMeasuredHeight?: (heightPx: number) => void;
};

const FALLBACK_ITERATION_HEADER_HEIGHT_PX = 34;

/** Droppable only on the group header so story rows win collision detection. */
const GroupHeaderDroppable = memo(function GroupHeaderDroppable({
  dropZoneId,
  children,
  onMeasuredHeight,
}: GroupHeaderDroppableProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { setNodeRef, isOver } = useDroppable({ id: dropZoneId });

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      wrapperRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  useLayoutEffect(() => {
    if (!onMeasuredHeight) return;
    const el = wrapperRef.current;
    if (!el) return;

    const measure = () => {
      const h = el.offsetHeight;
      onMeasuredHeight(h > 0 ? h : FALLBACK_ITERATION_HEADER_HEIGHT_PX);
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onMeasuredHeight]);

  return (
    <div
      ref={setRefs}
      className={`sticky top-0 ${Z_ITERATION_ROW_STICKY} ${isOver ? "ring-1 ring-inset ring-blue-300" : ""}`}
    >
      {children}
    </div>
  );
});

type IterationGroupShellProps = {
  dropZoneId: string;
  header: ReactNode;
  children: ReactNode;
};

/** Wraps iteration sprint header + stories; sets `--story-sticky-offset` to measured header height. */
const IterationGroupShell = memo(function IterationGroupShell({
  dropZoneId,
  header,
  children,
}: IterationGroupShellProps) {
  const [offsetPx, setOffsetPx] = useState(FALLBACK_ITERATION_HEADER_HEIGHT_PX);

  return (
    <section
      className="mb-2 rounded border border-gray-200 bg-white"
      style={
        {
          ["--story-sticky-offset"]: `${offsetPx}px`,
        } as CSSProperties
      }
    >
      <GroupHeaderDroppable
        dropZoneId={dropZoneId}
        onMeasuredHeight={(h) => setOffsetPx(h)}
      >
        {header}
      </GroupHeaderDroppable>
      {children}
    </section>
  );
});

export type StoryPanelProps = {
  panelType: PanelType;
  panelLabelOverride?: string;
  panelTestIdOverride?: string;
  headerAction?: ReactNode;
  stories: Story[];
  acceptedStories?: Story[];
  iterations?: Iteration[];
  storyCount?: number | null;
  totalPoints?: number | null;
  iterationPointsByIterationId?: Record<string, number>;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: (() => void) | null;
  expandedStoryIds?: Set<string>;
  onToggleExpand?: (storyId: string) => void;
  selectedStoryIds?: Set<string>;
  onStatusChange?: (story: Story, targetStatus: StoryStatus) => void;
  onSelect?: (storyId: string, selected: boolean) => void;
  sortable?: boolean;
  velocity?: number | null;
  replenishmentVelocity?: number | null;
  currentTotalPoints?: number | null;
  sprintDurationDays?: SprintDuration;
  iterationStartDay?: IterationStartDay;
  currentIterationEndDate?: string | null;
  hasNextPage?: boolean;
  loadingMore?: boolean;
  onLoadMore?: (() => void) | null;
  secondaryHasNextPage?: boolean;
  secondaryLoadingMore?: boolean;
  onSecondaryLoadMore?: (() => void) | null;
  secondaryLoadMoreLabel?: string;
  tertiaryHasNextPage?: boolean;
  tertiaryLoadingMore?: boolean;
  onTertiaryLoadMore?: (() => void) | null;
  tertiaryLoadMoreLabel?: string;
  acceptedHasNextPage?: boolean;
  acceptedLoadingMore?: boolean;
  onLoadMoreAccepted?: (() => void) | null;
  reverseOrder?: boolean;
  preserveStoryOrder?: boolean;
  renderExpandedContent?: (story: Story) => ReactNode;
  renderSubHeaderContent?: (story: Story) => ReactNode;
  onIterationUtilizationChange?: (
    iterationNumber: number,
    sprintUtilizationPercent: number,
    iterationStartDate?: string | null,
    iterationEndDate?: string | null,
  ) => void;
  currentIterationNumber?: number | null;
  utilizationOverrideByIterationNumber?: Record<number, number>;
  /** When set, non-release story cards show title/type/point inline Popovers (single useStoryPatch). */
  storyInlineEdit?: StoryInlineEditContext | null;
  projectLabels?: ProjectLabel[];
};

function StoryPanelComponent({
  panelType,
  panelLabelOverride,
  panelTestIdOverride,
  headerAction = null,
  stories,
  acceptedStories = [],
  iterations = [],
  storyCount = null,
  totalPoints: totalPointsOverride = null,
  iterationPointsByIterationId = {},
  isLoading = false,
  error = null,
  onRetry = null,
  expandedStoryIds,
  onToggleExpand,
  selectedStoryIds,
  onStatusChange,
  onSelect,
  sortable = false,
  velocity = null,
  replenishmentVelocity = null,
  currentTotalPoints = null,
  sprintDurationDays = 14,
  iterationStartDay = 1,
  currentIterationEndDate = null,
  hasNextPage = false,
  loadingMore = false,
  onLoadMore = null,
  secondaryHasNextPage = false,
  secondaryLoadingMore = false,
  onSecondaryLoadMore = null,
  secondaryLoadMoreLabel,
  tertiaryHasNextPage = false,
  tertiaryLoadingMore = false,
  onTertiaryLoadMore = null,
  tertiaryLoadMoreLabel,
  acceptedHasNextPage = false,
  acceptedLoadingMore = false,
  onLoadMoreAccepted = null,
  reverseOrder = false,
  preserveStoryOrder = false,
  renderExpandedContent,
  renderSubHeaderContent,
  onIterationUtilizationChange,
  currentIterationNumber = null,
  utilizationOverrideByIterationNumber = {},
  storyInlineEdit = null,
  projectLabels,
}: StoryPanelProps) {
  const { t } = useTranslation();
  const panelIdForTest = panelTestIdOverride ?? panelType;
  const currentAcceptedStories = useMemo(() => {
    if (panelType !== "Current") return [];
    return [...acceptedStories].sort((a, b) => {
      const compared = a.statusChangedAt.localeCompare(b.statusChangedAt);
      if (compared !== 0) return compared;
      return a.id.localeCompare(b.id);
    });
  }, [acceptedStories, panelType]);
  const hasCurrentAcceptedStories =
    panelType === "Current" && currentAcceptedStories.length > 0;
  const displayStories =
    panelType === "Current" ? [...currentAcceptedStories, ...stories] : stories;
  const showInitialLoading =
    isLoading && stories.length === 0 && !hasCurrentAcceptedStories;
  const totalPoints =
    totalPointsOverride ?? calculateTotalPoints(displayStories);
  const sortedStories = useMemo(() => {
    const shouldSortByPosition =
      sortable && panelType !== "Current" && !preserveStoryOrder;
    const sorted = shouldSortByPosition
      ? [...displayStories].sort((a, b) => a.position - b.position)
      : displayStories;
    return reverseOrder ? [...sorted].reverse() : sorted;
  }, [displayStories, sortable, reverseOrder, panelType, preserveStoryOrder]);
  const groupedStories = useMemo(() => {
    if (panelType === "Icebox") {
      return [];
    }
    return groupStoriesByIteration(sortedStories, iterations, {
      panelType,
      velocity: replenishmentVelocity,
      currentTotalPoints,
      sprintDurationDays,
      iterationStartDay,
      currentIterationEndDate,
      currentIterationNumber,
      utilizationOverrideByIterationNumber,
    });
  }, [
    currentIterationNumber,
    currentTotalPoints,
    currentIterationEndDate,
    iterationStartDay,
    iterations,
    panelType,
    replenishmentVelocity,
    sprintDurationDays,
    sortedStories,
    utilizationOverrideByIterationNumber,
  ]);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
    () => new Set(),
  );

  const { setNodeRef: setDropRef } = useDroppable({
    id: `drop-zone-${panelType}`,
  });
  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);
  const [
    draftUtilizationByIterationNumber,
    setDraftUtilizationByIterationNumber,
  ] = useState<Record<string, string>>({});
  const getDraftUtilization = useCallback(
    (iterationNumber: number, fallback: number) => {
      return (
        draftUtilizationByIterationNumber[String(iterationNumber)] ??
        String(fallback)
      );
    },
    [draftUtilizationByIterationNumber],
  );
  const commitIterationUtilization = useCallback(
    (
      iterationNumber: number,
      fallback: number,
      iterationStartDate?: string | null,
      iterationEndDate?: string | null,
    ) => {
      if (!onIterationUtilizationChange) return;
      const key = String(iterationNumber);
      const raw = draftUtilizationByIterationNumber[key] ?? String(fallback);
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        setDraftUtilizationByIterationNumber((current) => ({
          ...current,
          [key]: String(fallback),
        }));
        return;
      }
      onIterationUtilizationChange(
        iterationNumber,
        value,
        iterationStartDate,
        iterationEndDate,
      );
    },
    [draftUtilizationByIterationNumber, onIterationUtilizationChange],
  );
  const sortableStoryIds = useMemo(() => {
    if (panelType === "Icebox") {
      return sortedStories.map((story) => story.id);
    }
    return groupedStories.flatMap((group) =>
      collapsedGroupKeys.has(group.key)
        ? []
        : group.stories
            .filter(
              (story) =>
                !(panelType === "Current" && story.status === "Accepted"),
            )
            .map((story) => story.id),
    );
  }, [collapsedGroupKeys, groupedStories, panelType, sortedStories]);

  const storyStickyHeaderTopClassName = panelType === "Icebox" ? "top-0" : "";

  const buildCardProps = (story: Story) => ({
    selectedStoryIds,
    onStatusChange,
    onSelect,
    storyInlineEdit,
    projectLabels,
    stickyHeaderTopClassName: storyStickyHeaderTopClassName,
    stickyHeaderTopUsesIterationCssVar: panelType !== "Icebox",
    expandedContent:
      expandedStoryIds?.has(story.id) && renderExpandedContent
        ? renderExpandedContent(story)
        : undefined,
    subHeaderContent:
      expandedStoryIds?.has(story.id) && renderSubHeaderContent
        ? renderSubHeaderContent(story)
        : undefined,
  });
  const resolveGroupTotalPoints = useCallback(
    (groupIterationId: string | null, fallbackPoints: number) => {
      if (!groupIterationId) return fallbackPoints;
      const aggregatedPoints = iterationPointsByIterationId[groupIterationId];
      return typeof aggregatedPoints === "number"
        ? aggregatedPoints
        : fallbackPoints;
    },
    [iterationPointsByIterationId],
  );
  const groupHeaderButtonClassName =
    "flex w-full items-center justify-between gap-2 border-b border-gray-100 bg-white px-2 py-1.5 text-left";
  return (
    <section
      className="flex min-h-0 min-w-[300px] flex-1 flex-col border-r border-gray-200 last:border-r-0"
      data-testid={`panel-${panelIdForTest}`}
    >
      <header
        className={`sticky top-0 ${Z_PANEL_HEADER_STICKY} flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2`}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">
            {panelLabelOverride ?? PANEL_LABELS[panelType]}
          </h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              error ? "bg-red-100 text-red-700" : "bg-gray-200 text-gray-700"
            }`}
            title={error ? t("storyPanel.countFailed") : undefined}
          >
            {error ? "!" : (storyCount ?? stories.length)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {headerAction}
          <span className="text-xs text-gray-500">{totalPoints} pt</span>
          {velocity !== null ? (
            <span
              className="text-xs text-gray-400"
              title={t("storyPanel.velocityCapacity")}
            >
              / {velocity} pt
            </span>
          ) : null}
        </div>
      </header>

      <div
        ref={setDropRef}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        data-testid={`panel-scroll-${panelIdForTest}`}
      >
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-xs text-red-700" role="alert">
              {error}
            </p>
            <button
              type="button"
              className="mt-2 rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-red-700"
              onClick={() => onRetry?.()}
            >
              {t("storyPanel.retry")}
            </button>
          </div>
        ) : showInitialLoading ? (
          <p className="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-500">
            {t("storyPanel.loading")}
          </p>
        ) : stories.length === 0 && !hasCurrentAcceptedStories ? (
          <p className="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-500">
            {t("storyPanel.empty")}
          </p>
        ) : (
          <>
            {onLoadMore && hasNextPage && reverseOrder ? (
              <button
                type="button"
                className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onLoadMore}
                disabled={loadingMore}
              >
                {loadingMore
                  ? t("storyPanel.loading")
                  : t("storyPanel.loadMore")}
              </button>
            ) : null}
            {onSecondaryLoadMore && secondaryHasNextPage ? (
              <button
                type="button"
                className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onSecondaryLoadMore}
                disabled={secondaryLoadingMore}
              >
                {secondaryLoadingMore
                  ? t("storyPanel.loading")
                  : (secondaryLoadMoreLabel ??
                    t("storyPanel.loadMoreAdditional"))}
              </button>
            ) : null}
            {onTertiaryLoadMore && tertiaryHasNextPage ? (
              <button
                type="button"
                className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onTertiaryLoadMore}
                disabled={tertiaryLoadingMore}
              >
                {tertiaryLoadingMore
                  ? t("storyPanel.loading")
                  : (tertiaryLoadMoreLabel ??
                    t("storyPanel.loadMoreAdditional"))}
              </button>
            ) : null}
            {panelType === "Current" &&
            onLoadMoreAccepted &&
            acceptedHasNextPage ? (
              <button
                type="button"
                className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onLoadMoreAccepted}
                disabled={acceptedLoadingMore}
              >
                {acceptedLoadingMore
                  ? t("storyPanel.loading")
                  : t("storyPanel.loadMoreAdditional")}
              </button>
            ) : null}
            {panelType === "Icebox" ? (
              sortable ? (
                <SortableContext
                  items={sortedStories.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="space-y-1">
                    {sortedStories.map((story) => (
                      <SortableStoryItem
                        key={story.id}
                        story={story}
                        isExpanded={expandedStoryIds?.has(story.id) ?? false}
                        onToggleExpand={onToggleExpand}
                        {...buildCardProps(story)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              ) : (
                <ul className="space-y-1">
                  {sortedStories.map((story) => (
                    <li key={story.id}>
                      <StoryCard
                        key={story.id}
                        story={story}
                        isExpanded={expandedStoryIds?.has(story.id) ?? false}
                        onToggleExpand={onToggleExpand}
                        {...buildCardProps(story)}
                      />
                    </li>
                  ))}
                </ul>
              )
            ) : sortable ? (
              <SortableContext
                items={sortableStoryIds}
                strategy={verticalListSortingStrategy}
              >
                {groupedStories.map((group) => {
                  const isCollapsed = collapsedGroupKeys.has(group.key);
                  const groupDropZoneId = `drop-zone-group:${panelIdForTest}:${encodeURIComponent(group.key)}`;
                  return (
                    <IterationGroupShell
                      key={group.key}
                      dropZoneId={groupDropZoneId}
                      header={
                        <button
                          type="button"
                          className={groupHeaderButtonClassName}
                          onClick={() => toggleGroup(group.key)}
                        >
                          <span className="flex items-center gap-2 text-xs font-medium text-gray-700">
                            <span>{group.label}</span>
                            {group.iterationNumber !== null &&
                            onIterationUtilizationChange ? (
                              <span
                                className="inline-flex items-center gap-1 text-xs text-gray-500"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {t("storyPanel.utilization")}
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={getDraftUtilization(
                                    group.iterationNumber,
                                    group.effectiveSprintUtilizationPercent,
                                  )}
                                  className="w-14 rounded border border-gray-300 px-1 py-0.5 text-right text-xs"
                                  onChange={(event) => {
                                    setDraftUtilizationByIterationNumber(
                                      (current) => ({
                                        ...current,
                                        [String(group.iterationNumber!)]:
                                          event.target.value,
                                      }),
                                    );
                                  }}
                                  onBlur={() =>
                                    commitIterationUtilization(
                                      group.iterationNumber!,
                                      group.effectiveSprintUtilizationPercent,
                                      group.startDate,
                                      group.endDate,
                                    )
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      commitIterationUtilization(
                                        group.iterationNumber!,
                                        group.effectiveSprintUtilizationPercent,
                                        group.startDate,
                                        group.endDate,
                                      );
                                    }
                                  }}
                                />
                                %
                              </span>
                            ) : null}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            {resolveGroupTotalPoints(
                              group.iterationId,
                              group.totalPoints,
                            )}{" "}
                            pt
                            {isCollapsed ? (
                              <ChevronDown
                                className="inline-block h-3.5 w-3.5 shrink-0 text-gray-400"
                                aria-hidden
                              />
                            ) : (
                              <ChevronUp
                                className="inline-block h-3.5 w-3.5 shrink-0 text-gray-400"
                                aria-hidden
                              />
                            )}
                          </span>
                        </button>
                      }
                    >
                      {!isCollapsed ? (
                        <ul className="space-y-1 px-1 pb-1 pt-0">
                          {group.stories.map((story) =>
                            story.status === "Accepted" ? (
                              <li key={story.id}>
                                <StoryCard
                                  story={story}
                                  isExpanded={
                                    expandedStoryIds?.has(story.id) ?? false
                                  }
                                  onToggleExpand={onToggleExpand}
                                  {...buildCardProps(story)}
                                />
                              </li>
                            ) : (
                              <SortableStoryItem
                                key={story.id}
                                story={story}
                                isExpanded={
                                  expandedStoryIds?.has(story.id) ?? false
                                }
                                onToggleExpand={onToggleExpand}
                                {...buildCardProps(story)}
                              />
                            ),
                          )}
                        </ul>
                      ) : null}
                    </IterationGroupShell>
                  );
                })}
              </SortableContext>
            ) : (
              groupedStories.map((group) => {
                const isCollapsed = collapsedGroupKeys.has(group.key);
                const groupDropZoneId = `drop-zone-group:${panelIdForTest}:${encodeURIComponent(group.key)}`;
                return (
                  <IterationGroupShell
                    key={group.key}
                    dropZoneId={groupDropZoneId}
                    header={
                      <button
                        type="button"
                        className={groupHeaderButtonClassName}
                        onClick={() => toggleGroup(group.key)}
                      >
                        <span className="flex items-center gap-2 text-xs font-medium text-gray-700">
                          <span>{group.label}</span>
                          {group.iterationNumber !== null &&
                          onIterationUtilizationChange ? (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-gray-500"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {t("storyPanel.utilization")}
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={getDraftUtilization(
                                  group.iterationNumber,
                                  group.effectiveSprintUtilizationPercent,
                                )}
                                className="w-14 rounded border border-gray-300 px-1 py-0.5 text-right text-xs"
                                onChange={(event) => {
                                  setDraftUtilizationByIterationNumber(
                                    (current) => ({
                                      ...current,
                                      [String(group.iterationNumber!)]:
                                        event.target.value,
                                    }),
                                  );
                                }}
                                onBlur={() =>
                                  commitIterationUtilization(
                                    group.iterationNumber!,
                                    group.effectiveSprintUtilizationPercent,
                                    group.startDate,
                                    group.endDate,
                                  )
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    commitIterationUtilization(
                                      group.iterationNumber!,
                                      group.effectiveSprintUtilizationPercent,
                                      group.startDate,
                                      group.endDate,
                                    );
                                  }
                                }}
                              />
                              %
                            </span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          {resolveGroupTotalPoints(
                            group.iterationId,
                            group.totalPoints,
                          )}{" "}
                          pt
                          {isCollapsed ? (
                            <ChevronDown
                              className="inline-block h-3.5 w-3.5 shrink-0 text-gray-400"
                              aria-hidden
                            />
                          ) : (
                            <ChevronUp
                              className="inline-block h-3.5 w-3.5 shrink-0 text-gray-400"
                              aria-hidden
                            />
                          )}
                        </span>
                      </button>
                    }
                  >
                    {!isCollapsed ? (
                      <ul className="space-y-1 px-1 pb-1 pt-0">
                        {group.stories.map((story) => (
                          <li key={story.id}>
                            <StoryCard
                              story={story}
                              isExpanded={
                                expandedStoryIds?.has(story.id) ?? false
                              }
                              onToggleExpand={onToggleExpand}
                              {...buildCardProps(story)}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </IterationGroupShell>
                );
              })
            )}
            {onLoadMore && hasNextPage && !reverseOrder ? (
              <button
                type="button"
                className="mt-2 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onLoadMore}
                disabled={loadingMore}
              >
                {loadingMore
                  ? t("storyPanel.loading")
                  : panelType === "Current"
                    ? t("storyPanel.loadMoreAdditional")
                    : t("storyPanel.loadMore")}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

export const StoryPanel = memo(StoryPanelComponent);
