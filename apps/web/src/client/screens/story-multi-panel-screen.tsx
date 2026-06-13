import {
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  ChevronDown,
  ChevronUp,
  LayoutPanelLeft,
  Menu,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";

import { ErrorRetry } from "../components/error-retry";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { PermissionDenied } from "../components/permission-denied";
import {
  StorySearchBar,
  type StorySearchFilters,
} from "../components/story-search-bar";
import {
  SavedSearches,
  persistSavedSearch,
} from "../components/saved-searches";
import { ShortcutHelpDialog } from "../components/shortcut-help-dialog";
import { StoryDeleteConfirmDialog } from "../components/story-delete-confirm-dialog";
import { ReleaseMarkerCreateDialog } from "../components/release-marker-create-dialog";
import { StoryAccordionDetail } from "../components/story-accordion-detail";
import { StoryAccordionSubHeader } from "../components/story-accordion-sub-header";
import { PlanningPokerPanel } from "../components/planning-poker-panel";
import { StoryPanel } from "../components/story-panel";
import { AutoGrowSingleLineTextarea } from "../components/auto-grow-single-line-textarea";
import { useAuthError } from "../contexts/auth-error-context";
import { useToast } from "../contexts/toast-context";
import { useBreakpoint } from "../hooks/use-breakpoint";
import { useCurrentUser } from "../hooks/use-current-user";
import {
  useKeyboardShortcuts,
  type KeyboardShortcut,
} from "../hooks/use-keyboard-shortcuts";
import { useCurrentBacklogViewMode } from "../lib/current-backlog-view-mode";
import { findCurrentIteration } from "../lib/current-iteration";
import { usePanelStoriesQuery } from "../hooks/use-panel-stories-query";
import { usePlanningPokerSession } from "../hooks/use-planning-poker-session";
import { useProjectBootstrap } from "../hooks/use-project-bootstrap";
import { useStoryDeepLink } from "../hooks/use-story-deep-link";
import { useStoryMutations } from "../hooks/use-story-mutations";
import { isAuthError } from "../lib/api-error";
import { parseErrorMessage } from "../lib/parse-error-message";
import {
  PANEL_LABELS,
  PANEL_TYPES,
  usePanelVisibility,
  type PanelType,
} from "../lib/panel-visibility";
import { storyPanelCollisionDetection } from "../lib/story-panel-dnd-collision";
import {
  calculateTotalPoints,
  groupStoriesByIteration,
} from "../lib/story-panel-grouping";
import { STORY_STATUS_LABELS } from "../lib/story-status";
import {
  isStoryMultiPanelDropAllowed,
  panelTypeFromDropZoneGroupId,
} from "../lib/story-multi-panel-drop-allowed";
import {
  reorderStoriesById,
  reindexStoriesPosition,
} from "../lib/story-reorder";
import { persistStoryReorder } from "../lib/story-reorder-request";
import {
  projectPlanningPokerCloseApiPath,
  projectPlanningPokerSessionsApiPath,
  projectHistoryPath,
  projectMembersPath,
  projectSettingsPath,
  projectStoriesApiPath,
  projectVelocityDashboardPath,
} from "../lib/story-routes";
import type { Iteration } from "../types/iteration";
import type { ProjectLabel } from "../types/project-label";
import {
  DEFAULT_STORY_POINTS,
  STORY_STATUSES,
  STORY_TYPES,
  type Story,
  type StoryStatus,
  type StoryType,
} from "../types/story";

/** Inline create excludes release (release markers use a separate dialog). */
const INLINE_CREATABLE_STORY_TYPES = STORY_TYPES.filter(
  (t): t is Exclude<StoryType, "release"> => t !== "release",
);

const SHORTCUT_STATUS_KEYS: ReadonlyArray<readonly [string, StoryStatus]> = [
  ["1", "Unstarted"],
  ["2", "Started"],
  ["3", "Finished"],
  ["4", "Delivered"],
  ["5", "Accepted"],
  ["6", "Rejected"],
];
const IN_PROGRESS_STATUSES: ReadonlySet<StoryStatus> = new Set([
  "Started",
  "Finished",
  "Delivered",
]);
const BACKLOG_STATUSES: ReadonlySet<StoryStatus> = new Set([
  "Unstarted",
  "Rejected",
]);
const SHORTCUT_HELP_ITEM_KEYS = [
  { keyLabel: "?", descriptionKey: "openHelp" },
  { keyLabel: "j / k", descriptionKey: "move" },
  { keyLabel: "c", descriptionKey: "openCreate" },
  { keyLabel: "x", descriptionKey: "toggleSelection" },
  { keyLabel: "1-6", descriptionKey: "changeStatus" },
  {
    keyLabel: "Ctrl+S / Cmd+S",
    descriptionKey: "applyBulkStatus",
  },
] as const;

type QueryError = Error & { status?: number };
type DisplayPanelType = PanelType | "CurrentBacklogCombined";
const COMBINED_GROUP_DROP_ZONE_PREFIX =
  "drop-zone-group:CurrentBacklogCombined:";
type DesktopRefetchEventDetail = {
  requestId?: string;
  type?: "refetch:stories" | "refetch:screen";
  payload?: {
    projectId?: string;
  };
};

type CreateTargetPanel = "Icebox" | "Backlog" | "Current";

function toCreateTargetPanel(panel: DisplayPanelType): CreateTargetPanel {
  if (panel === "Current" || panel === "CurrentBacklogCombined")
    return "Current";
  if (panel === "Icebox") return "Icebox";
  return "Backlog";
}

function toCreatePayloadPanel(
  panel: CreateTargetPanel,
): "icebox" | "backlog" | "current" {
  if (panel === "Icebox") return "icebox";
  if (panel === "Current") return "current";
  return "backlog";
}

export function StoryMultiPanelScreen() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const { notifySessionExpired } = useAuthError();
  const { showToast } = useToast();
  const { user } = useCurrentUser();
  const { visibility, togglePanel, visiblePanels } = usePanelVisibility();
  const { mode: currentBacklogViewMode, toggleMode: toggleCurrentBacklogMode } =
    useCurrentBacklogViewMode(user?.id);
  const breakpoint = useBreakpoint();
  const sensors = useSensors(useSensor(PointerSensor));

  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DisplayPanelType>("Backlog");
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const retryRequestRef = useRef<null | (() => Promise<void>)>(null);

  // Status change
  const pendingStatusRef = useRef<Map<string, StoryStatus>>(new Map());
  const processingStoryIdsRef = useRef<Set<string>>(new Set());
  const optimisticStoryRef = useRef<Map<string, Story>>(new Map());
  const reorderRequestVersionRef = useRef<Record<PanelType, number>>({
    Done: 0,
    Current: 0,
    Backlog: 0,
    Icebox: 0,
  });

  // Delete
  const [pendingDeleteStory, setPendingDeleteStory] = useState<Story | null>(
    null,
  );
  const [deletingStoryId, setDeletingStoryId] = useState<string | null>(null);

  // Release marker creation
  const [showReleaseMarkerDialog, setShowReleaseMarkerDialog] = useState(false);
  const [creatingReleaseMarker, setCreatingReleaseMarker] = useState(false);

  // Advanced search bar toggle
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Selection & bulk operations
  const [selectedStoryIds, setSelectedStoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkStatus, setBulkStatus] = useState<StoryStatus>("Started");
  const [bulkLabelName, setBulkLabelName] = useState("");
  const [createTargetPanel, setCreateTargetPanel] =
    useState<CreateTargetPanel | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createStoryType, setCreateStoryType] =
    useState<Exclude<StoryType, "release">>("feature");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Accordion expand
  const [expandedStoryIds, setExpandedStoryIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Filters (declared here so callbacks below can reference)
  const [searchParams, setSearchParams] = useSearchParams();
  const pokerStoryId = searchParams.get("poker");
  const [isPokerPanelCollapsed, setIsPokerPanelCollapsed] = useState(false);
  const pokerSessionState = usePlanningPokerSession(projectId);
  const shortcutHelpItems = useMemo(
    () =>
      SHORTCUT_HELP_ITEM_KEYS.map((item) => ({
        keyLabel: item.keyLabel,
        description: t(
          `storyMultiPanelScreen.shortcuts.${item.descriptionKey}`,
        ),
      })),
    [t],
  );

  useEffect(() => {
    if (!projectId) return;
    const activeSession = pokerSessionState.session;
    const activeSessionStoryId = pokerSessionState.session?.storyId;
    if (!activeSession) {
      if (!pokerStoryId) return;
      const next = new URLSearchParams(searchParams);
      next.delete("poker");
      setSearchParams(next, { replace: true });
      return;
    }
    if (!activeSessionStoryId || pokerStoryId === activeSessionStoryId) return;
    const next = new URLSearchParams(searchParams);
    next.set("poker", activeSessionStoryId);
    setSearchParams(next, { replace: true });
  }, [
    projectId,
    pokerSessionState.session,
    pokerStoryId,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    if (breakpoint !== "sm" && mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  }, [breakpoint, mobileMenuOpen]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const mq = window.matchMedia("(max-width: 767px)");

    const syncPageOverflow = () => {
      // Keep page scroll disabled on desktop so panel-level sticky works reliably.
      const overflowValue = mq.matches ? "" : "hidden";
      document.body.style.overflow = overflowValue;
      document.documentElement.style.overflow = overflowValue;
    };

    syncPageOverflow();
    mq.addEventListener("change", syncPageOverflow);
    return () => {
      mq.removeEventListener("change", syncPageOverflow);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  // Search bar handlers
  const handleSearchFiltersChange = useCallback(
    (filters: StorySearchFilters) => {
      const next = new URLSearchParams(searchParams);
      if (filters.query) {
        next.set("q", filters.query);
      } else {
        next.delete("q");
      }
      if (filters.types.length > 0) {
        next.set("types", filters.types.join(","));
      } else {
        next.delete("types");
      }
      if (filters.unestimatedOnly) {
        next.set("point", "unestimated");
      } else {
        next.delete("point");
      }
      if (filters.ownerIds.length > 0) {
        next.set("owners", filters.ownerIds.join(","));
      } else {
        next.delete("owners");
      }
      if (filters.labels.length > 0) {
        next.set("labels", filters.labels.join(","));
      } else {
        next.delete("labels");
      }
      if (filters.epicIds.length > 0) {
        next.set("epicIds", filters.epicIds.join(","));
      } else {
        next.delete("epicIds");
      }
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  const handleSaveSearch = useCallback(
    async (name: string, filters: StorySearchFilters) => {
      if (!projectId) return;
      await persistSavedSearch(projectId, name, filters);
    },
    [projectId],
  );

  const handleApplySavedSearch = useCallback(
    (filters: StorySearchFilters) => {
      handleSearchFiltersChange(filters);
    },
    [handleSearchFiltersChange],
  );

  const handleToggleExpand = useCallback((storyId: string) => {
    setExpandedStoryIds((current) => {
      const next = new Set(current);
      if (next.has(storyId)) {
        next.delete(storyId);
      } else {
        next.add(storyId);
      }
      return next;
    });
  }, []);

  const showUnestimatedOnly = searchParams.get("point") === "unestimated";

  // Advanced search params (from StorySearchBar)
  const searchQuery = searchParams.get("q") ?? "";
  const rawTypesParam = searchParams.get("types");
  const VALID_STORY_TYPES: readonly string[] = [
    "feature",
    "bug",
    "chore",
    "release",
  ];
  const activeTypes: StoryType[] = rawTypesParam
    ? rawTypesParam
        .split(",")
        .map((t) => t.trim())
        .filter((t): t is StoryType => VALID_STORY_TYPES.includes(t))
    : [];
  const rawOwnersParam = searchParams.get("owners");
  const activeOwners = rawOwnersParam
    ? rawOwnersParam
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : [];
  const rawLabelsParam = searchParams.get("labels");
  const activeLabels = rawLabelsParam
    ? rawLabelsParam
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean)
    : [];
  const rawEpicIdsParam = searchParams.get("epicIds");
  const activeEpicIds = rawEpicIdsParam
    ? rawEpicIdsParam
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
    : [];

  const bootstrapQuery = useProjectBootstrap(projectId);
  const projectData = bootstrapQuery.data;
  const iterations: Iteration[] = projectData?.iterations ?? [];
  const iterationOverrides = projectData?.iterationOverrides ?? [];
  const velocity = projectData?.velocity ?? 0;
  const isBootstrapping = bootstrapQuery.isLoading;

  const currentIteration = useMemo(() => {
    return findCurrentIteration(iterations);
  }, [iterations]);

  const sprintUtilizationPercent =
    currentIteration?.effectiveSprintUtilizationPercent ?? 100;
  const effectiveVelocity = Math.floor(
    (velocity * sprintUtilizationPercent) / 100,
  );
  const utilizationOverrideByIterationNumber = useMemo(() => {
    const map: Record<number, number> = {};
    for (const override of iterationOverrides) {
      map[override.iterationNumber] = override.sprintUtilizationPercent;
    }
    return map;
  }, [iterationOverrides]);
  const memberOptions = projectData?.memberOptions ?? [];
  const projectLabels: ProjectLabel[] = projectData?.projectLabels ?? [];

  const panelQueries = usePanelStoriesQuery({
    projectId,
    currentIterationId: currentIteration?.id ?? null,
    filters: {
      searchQuery,
      activeOwners,
      activeLabels,
      activeEpicIds,
      activeTypes,
    },
    enabled: !bootstrapQuery.isLoading && !bootstrapQuery.isError,
  });

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<DesktopRefetchEventDetail>;
      const eventProjectId = customEvent.detail?.payload?.projectId;
      if (eventProjectId && projectId && eventProjectId !== projectId) return;
      const eventType = customEvent.detail?.type;
      if (eventType === "refetch:screen") {
        void bootstrapQuery.refetch();
        void panelQueries.refetchAll();
        return;
      }
      if (eventType === "refetch:stories") {
        void panelQueries.refetchAll();
      }
    };
    window.addEventListener("tatsumaki:desktop-ipc-refetch", listener);
    return () =>
      window.removeEventListener("tatsumaki:desktop-ipc-refetch", listener);
  }, [bootstrapQuery, panelQueries, projectId]);
  const {
    statusMutation,
    movePanelMutation,
    deleteStoryMutation,
    bulkStatusMutation,
    bulkLabelMutation,
    planStoryMoveToPanel,
  } = useStoryMutations({
    projectId,
    panelQueries,
    notifySessionExpired,
    setForbidden,
    setError,
    showToast,
  });

  const handleCreateReleaseMarker = useCallback(
    async (name: string, releaseDate: string | null) => {
      if (!projectId) return;
      setCreatingReleaseMarker(true);
      try {
        const response = await fetch(`/api/projects/${projectId}/stories`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: name,
            description: "",
            type: "release",
            status: "Unstarted",
            storyPoint: null,
            labels: [],
            epicId: null,
            isIcebox: false,
            ownerIds: [],
            requesterId: null,
            releaseDate,
          }),
        });
        if (!response.ok) {
          if (isAuthError(response.status)) {
            notifySessionExpired();
            return;
          }
          setError(await parseErrorMessage(response));
          return;
        }
        setShowReleaseMarkerDialog(false);
        void panelQueries.invalidatePanels({
          panels: ["Backlog"],
          refetchType: "active",
        });
      } finally {
        setCreatingReleaseMarker(false);
      }
    },
    [projectId, notifySessionExpired, panelQueries],
  );

  const allStories = useMemo(
    () => [
      ...panelQueries.panels.Done.stories,
      ...panelQueries.panels.Current.stories,
      ...panelQueries.panels.Backlog.stories,
      ...panelQueries.panels.Icebox.stories,
    ],
    [
      panelQueries.panels.Backlog.stories,
      panelQueries.panels.Current.stories,
      panelQueries.panels.Done.stories,
      panelQueries.panels.Icebox.stories,
    ],
  );
  const arePanelsReady =
    !isBootstrapping &&
    !panelQueries.panels.Done.isLoading &&
    !panelQueries.panels.Current.isLoading &&
    !panelQueries.panels.Backlog.isLoading &&
    !panelQueries.panels.Icebox.isLoading;

  useStoryDeepLink({
    projectId,
    allStories,
    isReady: arePanelsReady,
    setActiveStoryId,
    setExpandedStoryIds,
  });
  useEffect(() => {
    if (!projectId) return;
    retryRequestRef.current = () => bootstrapQuery.refetch().then(() => {});
  }, [bootstrapQuery, projectId]);

  useEffect(() => {
    if (bootstrapQuery.error instanceof Error) {
      const queryError = bootstrapQuery.error as QueryError;
      if (queryError.status === 401) {
        notifySessionExpired();
        return;
      }
      if (queryError.status === 403) {
        setForbidden(queryError.message);
        return;
      }
      setError(queryError.message);
      return;
    }
    setError(null);
  }, [bootstrapQuery.error, notifySessionExpired]);

  useEffect(() => {
    const panelStates = [
      panelQueries.panels.Done,
      panelQueries.panels.Current,
      panelQueries.panels.Backlog,
      panelQueries.panels.Icebox,
    ];
    const unauthorizedPanel = panelStates.find(
      (panel) => panel.statusCode === 401,
    );
    if (unauthorizedPanel) {
      notifySessionExpired();
      return;
    }
    const forbiddenPanel = panelStates.find(
      (panel) => panel.statusCode === 403,
    );
    if (forbiddenPanel && forbiddenPanel.error) {
      setForbidden(forbiddenPanel.error);
    }
  }, [
    notifySessionExpired,
    panelQueries.panels.Backlog.error,
    panelQueries.panels.Backlog.statusCode,
    panelQueries.panels.Current.error,
    panelQueries.panels.Current.statusCode,
    panelQueries.panels.Done.error,
    panelQueries.panels.Done.statusCode,
    panelQueries.panels.Icebox.error,
    panelQueries.panels.Icebox.statusCode,
  ]);

  // --- Filtering ---

  const filteredStories = useMemo(() => {
    let result = allStories;

    if (showUnestimatedOnly) {
      result = result.filter((s) => s.storyPoint === null);
    }

    if (activeTypes.length > 0) {
      result = result.filter((s) => activeTypes.includes(s.type));
    }

    return result;
  }, [activeTypes, allStories, showUnestimatedOnly]);

  const groupedStories = useMemo(() => {
    const matchesType = (story: Story) => {
      return activeTypes.length === 0 || activeTypes.includes(story.type);
    };
    const matchesEstimate = (story: Story) => {
      return !showUnestimatedOnly || story.storyPoint === null;
    };
    const filterStories = (input: Story[]) => {
      return input.filter(
        (story) => matchesType(story) && matchesEstimate(story),
      );
    };
    return {
      Done: filterStories(panelQueries.panels.Done.stories),
      Current: filterStories(panelQueries.panels.Current.stories),
      Backlog: filterStories(panelQueries.panels.Backlog.stories),
      Icebox: filterStories(panelQueries.panels.Icebox.stories),
    };
  }, [
    activeTypes,
    panelQueries.panels.Backlog.stories,
    panelQueries.panels.Current.stories,
    panelQueries.panels.Done.stories,
    panelQueries.panels.Icebox.stories,
    showUnestimatedOnly,
  ]);
  const currentAcceptedStories = useMemo(
    () => groupedStories.Current.filter((story) => story.status === "Accepted"),
    [groupedStories.Current],
  );
  const currentUnacceptedStories = useMemo(
    () => groupedStories.Current.filter((story) => story.status !== "Accepted"),
    [groupedStories.Current],
  );
  const currentBacklogCombinedStories = useMemo(() => {
    return [...groupedStories.Current, ...groupedStories.Backlog];
  }, [groupedStories.Backlog, groupedStories.Current]);
  const useLocalFilteredCount = activeTypes.length > 0 || showUnestimatedOnly;
  const useLocalFilteredPoints = activeTypes.length > 0 || showUnestimatedOnly;
  const currentBacklogCombinedCount = useLocalFilteredCount
    ? groupedStories.Current.length + groupedStories.Backlog.length
    : (panelQueries.panels.Current.total ?? groupedStories.Current.length) +
      (panelQueries.panels.Backlog.total ?? groupedStories.Backlog.length);
  const currentBacklogCombinedTotalPoints = useLocalFilteredPoints
    ? calculateTotalPoints(groupedStories.Current) +
      calculateTotalPoints(groupedStories.Backlog)
    : (panelQueries.panels.Current.totalPoints ??
        calculateTotalPoints(groupedStories.Current)) +
      (panelQueries.panels.Backlog.totalPoints ??
        calculateTotalPoints(groupedStories.Backlog));
  const currentBacklogCombinedPointsByIterationId = useMemo(() => {
    const pointsByIterationId: Record<string, number> = {};
    const applyPoints = (points: Record<string, number>) => {
      for (const [iterationId, totalPoints] of Object.entries(points)) {
        pointsByIterationId[iterationId] =
          (pointsByIterationId[iterationId] ?? 0) + totalPoints;
      }
    };
    if (useLocalFilteredPoints) {
      for (const story of currentBacklogCombinedStories) {
        if (!story.iterationId) continue;
        pointsByIterationId[story.iterationId] =
          (pointsByIterationId[story.iterationId] ?? 0) +
          (story.storyPoint ?? 0);
      }
      return pointsByIterationId;
    }
    applyPoints(panelQueries.panels.Current.pointsByIterationId);
    applyPoints(panelQueries.panels.Backlog.pointsByIterationId);
    return pointsByIterationId;
  }, [
    currentBacklogCombinedStories,
    panelQueries.panels.Backlog.pointsByIterationId,
    panelQueries.panels.Current.pointsByIterationId,
    useLocalFilteredPoints,
  ]);
  const shouldCombineCurrentBacklog =
    currentBacklogViewMode === "combined" &&
    visibility.Current &&
    visibility.Backlog;
  const displayVisiblePanels = useMemo<DisplayPanelType[]>(() => {
    const next: DisplayPanelType[] = [];
    for (const panel of visiblePanels) {
      if (panel === "Current" && shouldCombineCurrentBacklog) {
        next.push("CurrentBacklogCombined");
        continue;
      }
      if (panel === "Backlog" && shouldCombineCurrentBacklog) {
        continue;
      }
      next.push(panel);
    }
    return next;
  }, [shouldCombineCurrentBacklog, visiblePanels]);
  const toolbarDefaultPanel: CreateTargetPanel = displayVisiblePanels.some(
    (panel) => panel === "Current" || panel === "CurrentBacklogCombined",
  )
    ? "Current"
    : "Icebox";
  const currentStoryIdSet = useMemo(
    () => new Set(groupedStories.Current.map((story) => story.id)),
    [groupedStories.Current],
  );
  const combinedIterationGroups = useMemo(() => {
    if (!shouldCombineCurrentBacklog) return [];
    return groupStoriesByIteration(currentBacklogCombinedStories, iterations, {
      panelType: "Backlog",
      velocity: effectiveVelocity > 0 ? effectiveVelocity : null,
      currentTotalPoints: useLocalFilteredPoints
        ? calculateTotalPoints(groupedStories.Current)
        : (panelQueries.panels.Current.totalPoints ??
          calculateTotalPoints(groupedStories.Current)),
      sprintDurationDays: projectData?.project?.sprintDurationDays ?? 14,
      iterationStartDay: projectData?.project?.iterationStartDay ?? 1,
      currentIterationEndDate: currentIteration?.endDate ?? null,
      currentIterationNumber: currentIteration?.iterationNumber ?? null,
      utilizationOverrideByIterationNumber,
    });
  }, [
    currentBacklogCombinedStories,
    shouldCombineCurrentBacklog,
    iterations,
    effectiveVelocity,
    groupedStories.Current,
    panelQueries.panels.Current.totalPoints,
    projectData?.project?.sprintDurationDays,
    projectData?.project?.iterationStartDay,
    currentIteration?.endDate,
    currentIteration?.iterationNumber,
    utilizationOverrideByIterationNumber,
    useLocalFilteredPoints,
  ]);
  const combinedTargetPanelByGroupKey = useMemo(() => {
    const map = new Map<string, PanelType>();
    for (const group of combinedIterationGroups) {
      const mapsToCurrent =
        (currentIteration?.id !== undefined &&
          currentIteration?.id !== null &&
          group.iterationId === currentIteration.id) ||
        group.stories.some((story) => currentStoryIdSet.has(story.id));
      map.set(group.key, mapsToCurrent ? "Current" : "Backlog");
    }
    return map;
  }, [combinedIterationGroups, currentIteration?.id, currentStoryIdSet]);

  const panelDisplayCounts = useMemo<Record<PanelType, number | null>>(() => {
    if (useLocalFilteredCount) {
      return {
        Done: groupedStories.Done.length,
        Current: groupedStories.Current.length,
        Backlog: groupedStories.Backlog.length,
        Icebox: groupedStories.Icebox.length,
      };
    }

    return {
      Done: panelQueries.panels.Done.total,
      Current: panelQueries.panels.Current.total,
      Backlog: panelQueries.panels.Backlog.total,
      Icebox: panelQueries.panels.Icebox.total,
    };
  }, [useLocalFilteredCount, panelQueries.panels, groupedStories]);
  const panelDisplayTotalPoints = useMemo<
    Record<PanelType, number | null>
  >(() => {
    if (useLocalFilteredPoints) {
      return {
        Done: calculateTotalPoints(groupedStories.Done),
        Current: calculateTotalPoints(groupedStories.Current),
        Backlog: calculateTotalPoints(groupedStories.Backlog),
        Icebox: calculateTotalPoints(groupedStories.Icebox),
      };
    }

    return {
      Done: panelQueries.panels.Done.totalPoints,
      Current: panelQueries.panels.Current.totalPoints,
      Backlog: panelQueries.panels.Backlog.totalPoints,
      Icebox: panelQueries.panels.Icebox.totalPoints,
    };
  }, [groupedStories, panelQueries.panels, useLocalFilteredPoints]);
  const panelIterationPointsById = useMemo<
    Record<PanelType, Record<string, number>>
  >(() => {
    if (useLocalFilteredPoints) {
      const toMap = (stories: Story[]) => {
        const map: Record<string, number> = {};
        for (const story of stories) {
          if (!story.iterationId) continue;
          map[story.iterationId] =
            (map[story.iterationId] ?? 0) + (story.storyPoint ?? 0);
        }
        return map;
      };
      return {
        Done: toMap(groupedStories.Done),
        Current: toMap(groupedStories.Current),
        Backlog: toMap(groupedStories.Backlog),
        Icebox: toMap(groupedStories.Icebox),
      };
    }
    return {
      Done: panelQueries.panels.Done.pointsByIterationId,
      Current: panelQueries.panels.Current.pointsByIterationId,
      Backlog: panelQueries.panels.Backlog.pointsByIterationId,
      Icebox: panelQueries.panels.Icebox.pointsByIterationId,
    };
  }, [groupedStories, panelQueries.panels, useLocalFilteredPoints]);

  // --- Selected story IDs (visible only) ---

  const allVisibleStoryIds = useMemo(
    () => new Set(filteredStories.map((s) => s.id)),
    [filteredStories],
  );

  const selectedVisibleStoryIds = useMemo(
    () =>
      Array.from(selectedStoryIds).filter((id) => allVisibleStoryIds.has(id)),
    [selectedStoryIds, allVisibleStoryIds],
  );
  const selectedVisibleStories = useMemo(() => {
    const selectedIdSet = new Set(selectedVisibleStoryIds);
    return allStories.filter((story) => selectedIdSet.has(story.id));
  }, [allStories, selectedVisibleStoryIds]);

  useEffect(() => {
    setSelectedStoryIds((current) => {
      const next = new Set<string>();
      for (const id of current) {
        if (allVisibleStoryIds.has(id)) {
          next.add(id);
        }
      }
      return next;
    });
  }, [allVisibleStoryIds]);

  // --- Status change ---

  const handleStatusChange = async (story: Story, nextStatus: StoryStatus) => {
    retryRequestRef.current = () => handleStatusChange(story, nextStatus);
    setError(null);

    const optimisticBase = optimisticStoryRef.current.get(story.id) ?? story;
    const shouldAssignCurrentIteration =
      IN_PROGRESS_STATUSES.has(nextStatus) &&
      optimisticBase.iterationId === null &&
      !optimisticBase.isIcebox &&
      currentIteration?.id;
    const shouldClearIteration =
      BACKLOG_STATUSES.has(nextStatus) &&
      optimisticBase.iterationId !== null &&
      (!currentIteration?.id ||
        optimisticBase.iterationId !== currentIteration.id);

    const optimisticStory: Story = {
      ...optimisticBase,
      status: nextStatus,
      iterationId: shouldAssignCurrentIteration
        ? currentIteration.id
        : shouldClearIteration
          ? null
          : optimisticBase.iterationId,
    };
    optimisticStoryRef.current.set(story.id, optimisticStory);
    panelQueries.applyStoryUpdate(optimisticStory);

    pendingStatusRef.current.set(story.id, nextStatus);

    if (processingStoryIdsRef.current.has(story.id)) {
      return;
    }

    processingStoryIdsRef.current.add(story.id);

    try {
      let latestServerStory = story;

      while (true) {
        const queuedStatus = pendingStatusRef.current.get(story.id);
        if (queuedStatus === undefined) {
          break;
        }
        pendingStatusRef.current.delete(story.id);

        try {
          latestServerStory = await statusMutation.mutateAsync({
            story: latestServerStory,
            nextStatus: queuedStatus,
            currentIterationId: currentIteration?.id ?? null,
          });
          const latestOptimistic = optimisticStoryRef.current.get(story.id);
          if (
            latestOptimistic &&
            latestOptimistic.status !== latestServerStory.status
          ) {
            panelQueries.applyStoryUpdate(latestOptimistic);
          } else {
            optimisticStoryRef.current.set(story.id, latestServerStory);
          }
        } catch {
          // Rollback and toast are handled in the mutation hook.
          optimisticStoryRef.current.delete(story.id);
        }
      }
    } finally {
      processingStoryIdsRef.current.delete(story.id);
      pendingStatusRef.current.delete(story.id);
      optimisticStoryRef.current.delete(story.id);
    }
  };

  // --- Delete ---

  const handleDelete = async () => {
    if (!pendingDeleteStory) return;

    retryRequestRef.current = handleDelete;
    setDeletingStoryId(pendingDeleteStory.id);
    setError(null);

    try {
      await deleteStoryMutation.mutateAsync({ story: pendingDeleteStory });
      setPendingDeleteStory(null);
    } catch {
      // Rollback and toast are handled in the mutation hook.
    } finally {
      setDeletingStoryId(null);
    }
  };

  // --- Bulk operations ---

  const handleBulkStatusChange = async () => {
    if (!projectId || selectedVisibleStoryIds.length === 0) return;

    retryRequestRef.current = handleBulkStatusChange;
    setError(null);

    try {
      await bulkStatusMutation.mutateAsync({
        storyIds: selectedVisibleStoryIds,
        stories: selectedVisibleStories,
        status: bulkStatus,
        currentIterationId: currentIteration?.id ?? null,
      });
      setSelectedStoryIds(new Set());
    } catch {
      // Rollback and toast are handled in the mutation hook.
    }
  };

  const handleBulkAddLabel = async () => {
    if (!projectId || selectedVisibleStoryIds.length === 0 || !bulkLabelName)
      return;

    retryRequestRef.current = handleBulkAddLabel;
    setError(null);

    try {
      await bulkLabelMutation.mutateAsync({
        storyIds: selectedVisibleStoryIds,
        stories: selectedVisibleStories,
        labelName: bulkLabelName,
      });
      setSelectedStoryIds(new Set());
    } catch {
      // Rollback and toast are handled in the mutation hook.
    }
  };

  const moveStoryToPanel = async (storyId: string, targetPanel: PanelType) => {
    if (!projectId) return;

    const originalStory = allStories.find((s) => s.id === storyId);
    if (!originalStory) return;

    const plan = planStoryMoveToPanel({
      story: originalStory,
      targetPanel,
      currentIterationId: currentIteration?.id ?? null,
    });
    if (!plan.ok) {
      showToast("error", plan.error);
      return;
    }

    setError(null);

    try {
      await movePanelMutation.mutateAsync({
        story: originalStory,
        targetPanel,
        plan,
      });
    } catch {
      // Rollback and toast are handled in the mutation hook.
    }
  };

  // --- Drag-and-drop: cross-panel transfer + within-panel reorder ---

  const findPanelByStoryId = useCallback(
    (storyId: string): PanelType | null => {
      if (shouldCombineCurrentBacklog) {
        const story = currentBacklogCombinedStories.find(
          (item) => item.id === storyId,
        );
        if (story) {
          return currentStoryIdSet.has(story.id) ? "Current" : "Backlog";
        }
      }
      for (const panel of ["Done", "Current", "Backlog", "Icebox"] as const) {
        const panelStories =
          panel === "Current" ? groupedStories.Current : groupedStories[panel];
        if (panelStories.some((story) => story.id === storyId)) {
          return panel;
        }
      }
      return null;
    },
    [
      currentBacklogCombinedStories,
      currentStoryIdSet,
      groupedStories,
      shouldCombineCurrentBacklog,
    ],
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const overId = event.over?.id;
    if (!overId || !projectId) return;

    const activeId = String(event.active.id);
    const overIdStr = String(overId);
    const sourcePanel = findPanelByStoryId(activeId);
    if (!sourcePanel) return;
    let targetPanel: PanelType | null = null;
    if (
      shouldCombineCurrentBacklog &&
      overIdStr.startsWith(COMBINED_GROUP_DROP_ZONE_PREFIX)
    ) {
      const encodedGroupKey = overIdStr.slice(
        COMBINED_GROUP_DROP_ZONE_PREFIX.length,
      );
      let decodedGroupKey = encodedGroupKey;
      try {
        decodedGroupKey = decodeURIComponent(encodedGroupKey);
      } catch {
        decodedGroupKey = encodedGroupKey;
      }
      targetPanel = combinedTargetPanelByGroupKey.get(decodedGroupKey) ?? null;
    } else if (overIdStr.startsWith("drop-zone-group:")) {
      targetPanel = panelTypeFromDropZoneGroupId(overIdStr);
    } else if (overIdStr.startsWith("drop-zone-")) {
      targetPanel = overIdStr.replace("drop-zone-", "") as PanelType;
    } else {
      targetPanel = findPanelByStoryId(overIdStr);
    }
    if (
      shouldCombineCurrentBacklog &&
      overIdStr === "drop-zone-Backlog" &&
      sourcePanel !== "Done"
    ) {
      targetPanel = sourcePanel;
    }
    if (!targetPanel) return;

    // Cross-panel transfer matrix
    if (sourcePanel !== targetPanel) {
      if (
        targetPanel === "Backlog" ||
        targetPanel === "Current" ||
        targetPanel === "Icebox"
      ) {
        void moveStoryToPanel(activeId, targetPanel);
      }
      // Done panel is read-only.
      return;
    }

    // Within-panel reorder (Backlog / Current / Icebox).
    // In combined mode, keep same-logical-panel reorder enabled so behavior
    // stays consistent with split mode.
    const reorderTargetStories =
      sourcePanel === "Backlog"
        ? groupedStories.Backlog
        : sourcePanel === "Current"
          ? currentUnacceptedStories
          : sourcePanel === "Icebox"
            ? groupedStories.Icebox
            : null;
    if (!reorderTargetStories) return;

    const sorted = [...reorderTargetStories].sort(
      (a, b) => a.position - b.position,
    );
    // When over.id is the panel drop-zone sentinel (e.g. story dropped on a sprint
    // group header), @dnd-kit reports the panel droppable instead of a story id.
    // Resolve to the last story so the reorder completes rather than silently reverting.
    let resolvedOverId = overIdStr;
    if (overIdStr.startsWith("drop-zone-")) {
      resolvedOverId = sorted[sorted.length - 1]?.id ?? overIdStr;
    } else if (
      shouldCombineCurrentBacklog &&
      overIdStr.startsWith(COMBINED_GROUP_DROP_ZONE_PREFIX)
    ) {
      const encodedGroupKey = overIdStr.slice(
        COMBINED_GROUP_DROP_ZONE_PREFIX.length,
      );
      let decodedGroupKey = encodedGroupKey;
      try {
        decodedGroupKey = decodeURIComponent(encodedGroupKey);
      } catch {
        decodedGroupKey = encodedGroupKey;
      }
      const targetGroup = combinedIterationGroups.find(
        (group) => group.key === decodedGroupKey,
      );
      const candidateStories =
        targetGroup?.stories.filter((story) =>
          sourcePanel === "Current"
            ? currentStoryIdSet.has(story.id) && story.status !== "Accepted"
            : !currentStoryIdSet.has(story.id),
        ) ?? [];
      resolvedOverId =
        candidateStories[candidateStories.length - 1]?.id ??
        sorted[sorted.length - 1]?.id ??
        overIdStr;
    }
    const reordered = reorderStoriesById(sorted, activeId, resolvedOverId);
    if (!reordered) return;
    const optimisticReordered = reindexStoriesPosition(reordered);

    const rollbackStories = panelQueries.panels[sourcePanel].stories;
    const nextRequestVersion =
      (reorderRequestVersionRef.current[sourcePanel] ?? 0) + 1;
    reorderRequestVersionRef.current[sourcePanel] = nextRequestVersion;
    const isLatestRequest = () =>
      reorderRequestVersionRef.current[sourcePanel] === nextRequestVersion;

    // Optimistic update
    panelQueries.replacePanelStories(sourcePanel, optimisticReordered);

    await persistStoryReorder({
      projectId,
      sourcePanel,
      optimisticReordered,
      rollbackStories,
      isLatestRequest,
      replacePanelStories: panelQueries.replacePanelStories,
      applyExistingStoriesInPanel: panelQueries.applyExistingStoriesInPanel,
      invalidatePanel: (panel) =>
        panelQueries.invalidatePanels({ panels: [panel], refetchType: "none" }),
      setError,
      notifySessionExpired,
      showSuccessToast: () =>
        showToast("success", t("storyMultiPanelScreen.toast.reorderSaved")),
      showErrorToast: () =>
        showToast("error", t("storyMultiPanelScreen.toast.reorderFailed")),
    });
  };

  const dropAllowanceBase = useMemo(
    () => ({
      projectId,
      findPanelByStoryId,
      shouldCombineCurrentBacklog,
      combinedGroupDropZonePrefix: COMBINED_GROUP_DROP_ZONE_PREFIX,
      combinedTargetPanelByGroupKey,
      allStories,
      currentIterationId: currentIteration?.id ?? null,
      groupedStories,
      currentUnacceptedStories,
    }),
    [
      projectId,
      findPanelByStoryId,
      shouldCombineCurrentBacklog,
      combinedTargetPanelByGroupKey,
      allStories,
      currentIteration?.id,
      groupedStories,
      currentUnacceptedStories,
    ],
  );

  const handleDndDragMove = useCallback(
    (event: DragMoveEvent) => {
      const allowed = isStoryMultiPanelDropAllowed({
        ...dropAllowanceBase,
        activeStoryId: String(event.active.id),
        overId: event.over?.id,
      });
      document.body.style.cursor = allowed ? "grabbing" : "not-allowed";
    },
    [dropAllowanceBase],
  );

  const handleDndDragStart = useCallback(() => {
    document.body.style.cursor = "grabbing";
  }, []);

  const resetDndBodyCursor = useCallback(() => {
    document.body.style.cursor = "";
  }, []);

  // --- Selection helpers ---

  const handleSelect = (storyId: string, selected: boolean) => {
    setSelectedStoryIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(storyId);
      } else {
        next.delete(storyId);
      }
      return next;
    });
  };

  const allVisibleSelected =
    filteredStories.length > 0 &&
    selectedVisibleStoryIds.length === filteredStories.length;
  const hasActiveFilters =
    searchQuery.length > 0 ||
    activeTypes.length > 0 ||
    showUnestimatedOnly ||
    activeOwners.length > 0 ||
    activeLabels.length > 0 ||
    activeEpicIds.length > 0;
  const hasPanelErrors =
    Boolean(panelQueries.panels.Done.error) ||
    Boolean(panelQueries.panels.Current.error) ||
    Boolean(panelQueries.panels.Backlog.error) ||
    Boolean(panelQueries.panels.Icebox.error);

  const handleLoadMore = useCallback(
    (panel: PanelType) => {
      void panelQueries.panels[panel].fetchNextPage();
    },
    [panelQueries.panels],
  );

  const orderedVisibleStories = useMemo(() => {
    const orderedPanels =
      breakpoint === "sm" ? [activeTab] : displayVisiblePanels;
    return orderedPanels.flatMap((panel) =>
      panel === "CurrentBacklogCombined"
        ? currentBacklogCombinedStories
        : groupedStories[panel],
    );
  }, [
    activeTab,
    breakpoint,
    currentBacklogCombinedStories,
    displayVisiblePanels,
    groupedStories,
  ]);

  useEffect(() => {
    if (orderedVisibleStories.length === 0) {
      setActiveStoryId(null);
      return;
    }
    if (
      activeStoryId &&
      orderedVisibleStories.some((story) => story.id === activeStoryId)
    ) {
      return;
    }
    setActiveStoryId(orderedVisibleStories[0]?.id ?? null);
  }, [activeStoryId, orderedVisibleStories]);

  const openCreateForm = useCallback((panel: CreateTargetPanel) => {
    setCreateTargetPanel((current) => (current === panel ? current : panel));
    setCreateError(null);
  }, []);

  const closeCreateForm = useCallback(() => {
    setCreateTargetPanel(null);
    setCreateError(null);
    setCreateTitle("");
    setCreateStoryType("feature");
    setCreateSubmitting(false);
  }, []);

  const submitInlineStory = useCallback(async () => {
    if (!projectId || !createTargetPanel) return;
    const title = createTitle.trim();
    if (!title) {
      setCreateError(t("storyMultiPanelScreen.create.requiredTitle"));
      return;
    }
    if (createTargetPanel === "Current" && !currentIteration?.id) {
      setCreateError(t("storyMultiPanelScreen.create.currentUnavailable"));
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const response = await fetch(projectStoriesApiPath(projectId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          panel: toCreatePayloadPanel(createTargetPanel),
          status: "Unstarted",
          type: createStoryType,
        }),
      });
      if (!response.ok) {
        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        setCreateError(await parseErrorMessage(response));
        return;
      }
      const payload = (await response.json()) as { story?: Story };
      const createdStory = payload.story;
      if (!createdStory) {
        setCreateError(t("storyMultiPanelScreen.create.invalidResponse"));
        return;
      }
      panelQueries.applyStoryUpdate(createdStory);
      setExpandedStoryIds((current) => new Set(current).add(createdStory.id));
      setActiveStoryId(createdStory.id);
      showToast(
        "success",
        t("storyMultiPanelScreen.toast.storyCreated", {
          title: createdStory.title,
        }),
      );
      closeCreateForm();
    } catch {
      setCreateError(t("storyMultiPanelScreen.create.requestFailed"));
    } finally {
      setCreateSubmitting(false);
    }
  }, [
    closeCreateForm,
    createTargetPanel,
    createStoryType,
    createTitle,
    currentIteration?.id,
    notifySessionExpired,
    panelQueries,
    projectId,
    showToast,
    t,
  ]);

  const keyboardShortcuts = useMemo<KeyboardShortcut[]>(() => {
    const shortcuts: KeyboardShortcut[] = [
      {
        key: "?",
        shift: true,
        action: (event) => {
          event.preventDefault();
          setShowShortcutHelp((current) => !current);
        },
        description: "Show keyboard shortcuts",
      },
      {
        key: "Escape",
        allowInInput: true,
        action: () => {
          setShowShortcutHelp(false);
          if (createTargetPanel !== null) {
            closeCreateForm();
          }
        },
        description: "Close dialogs/forms",
      },
      {
        key: "c",
        action: (event) => {
          event.preventDefault();
          openCreateForm(toolbarDefaultPanel);
        },
        description: "Open inline create form",
      },
      {
        key: "x",
        action: (event) => {
          event.preventDefault();
          if (!activeStoryId) return;
          handleSelect(activeStoryId, !selectedStoryIds.has(activeStoryId));
        },
        description: "Toggle active story selection",
      },
      {
        key: "j",
        action: (event) => {
          event.preventDefault();
          if (showShortcutHelp || orderedVisibleStories.length === 0) return;
          const currentIndex = activeStoryId
            ? orderedVisibleStories.findIndex((s) => s.id === activeStoryId)
            : -1;
          const nextIndex =
            currentIndex >= 0
              ? Math.min(currentIndex + 1, orderedVisibleStories.length - 1)
              : 0;
          const nextStory = orderedVisibleStories[nextIndex];
          if (!nextStory) return;
          setActiveStoryId(nextStory.id);
          setSelectedStoryIds(new Set([nextStory.id]));
        },
        description: "Move selection down",
      },
      {
        key: "k",
        action: (event) => {
          event.preventDefault();
          if (showShortcutHelp || orderedVisibleStories.length === 0) return;
          const currentIndex = activeStoryId
            ? orderedVisibleStories.findIndex((s) => s.id === activeStoryId)
            : -1;
          const nextIndex =
            currentIndex >= 0 ? Math.max(currentIndex - 1, 0) : 0;
          const nextStory = orderedVisibleStories[nextIndex];
          if (!nextStory) return;
          setActiveStoryId(nextStory.id);
          setSelectedStoryIds(new Set([nextStory.id]));
        },
        description: "Move selection up",
      },
      {
        key: "s",
        ctrl: true,
        action: (event) => {
          event.preventDefault();
          void handleBulkStatusChange();
        },
        description: "Apply bulk status change",
      },
      {
        key: "s",
        meta: true,
        action: (event) => {
          event.preventDefault();
          void handleBulkStatusChange();
        },
        description: "Apply bulk status change",
      },
    ];
    for (const [key, status] of SHORTCUT_STATUS_KEYS) {
      shortcuts.push({
        key,
        action: (event) => {
          event.preventDefault();
          if (!activeStoryId) return;
          const target = allStories.find((story) => story.id === activeStoryId);
          if (!target || target.status === status) return;
          void handleStatusChange(target, status);
        },
        description: `Change active story status to ${status}`,
      });
    }
    return shortcuts;
  }, [
    activeStoryId,
    allStories,
    closeCreateForm,
    createTargetPanel,
    handleBulkStatusChange,
    openCreateForm,
    orderedVisibleStories,
    selectedStoryIds,
    showShortcutHelp,
    toolbarDefaultPanel,
  ]);

  useKeyboardShortcuts(keyboardShortcuts);

  const handleOpenPoker = (storyId: string) => {
    void (async () => {
      if (!projectId) return;
      if (pokerSessionState.session?.storyId === storyId) {
        const next = new URLSearchParams(searchParams);
        next.set("poker", storyId);
        setIsPokerPanelCollapsed(false);
        setSearchParams(next);
        return;
      }
      try {
        const response = await fetch(
          projectPlanningPokerSessionsApiPath(projectId),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ storyId, replaceActive: true }),
          },
        );
        if (!response.ok) {
          showToast("error", await parseErrorMessage(response));
          return;
        }
        const payload = (await response.json()) as {
          session: typeof pokerSessionState.session;
        };
        pokerSessionState.setSession(payload.session);
        const next = new URLSearchParams(searchParams);
        next.set("poker", storyId);
        setIsPokerPanelCollapsed(false);
        setSearchParams(next);
      } catch {
        showToast("error", t("storyMultiPanelScreen.toast.pokerSwitchFailed"));
      }
    })();
  };

  // --- Render ---

  if (forbidden) {
    return (
      <PermissionDenied
        message={forbidden}
        nextAction={t("storyMultiPanelScreen.permission.nextAction")}
        retryHint={t("storyMultiPanelScreen.permission.retryHint")}
        onRetry={() => {
          setForbidden(null);
          void retryRequestRef.current?.();
        }}
        backTo="/projects"
      />
    );
  }

  const storyInlineEdit = projectData?.project
    ? {
        onStoryUpdated: panelQueries.applyStoryUpdate,
        pointScale:
          projectData.project.pointScale &&
          projectData.project.pointScale.length > 0
            ? projectData.project.pointScale
            : [...DEFAULT_STORY_POINTS],
        estimateBugs: projectData.project.estimateBugs ?? true,
        estimateChores: projectData.project.estimateChores ?? true,
      }
    : null;

  const panelSharedProps = {
    storyInlineEdit,
    expandedStoryIds,
    onToggleExpand: handleToggleExpand,
    selectedStoryIds,
    projectLabels,
    onStatusChange: (story: Story, status: StoryStatus) => {
      void handleStatusChange(story, status);
    },
    onSelect: handleSelect,
    renderExpandedContent: (story: Story) => (
      <StoryAccordionDetail
        story={story}
        mentionCandidates={memberOptions}
        onStoryUpdated={panelQueries.applyStoryUpdate}
      />
    ),
    renderSubHeaderContent: (story: Story) => (
      <StoryAccordionSubHeader
        story={story}
        memberOptions={memberOptions}
        onDelete={setPendingDeleteStory}
        isDeleting={deletingStoryId === story.id}
        onStoryUpdated={panelQueries.applyStoryUpdate}
        onOpenPoker={handleOpenPoker}
      />
    ),
  };

  const renderPanel = (panel: DisplayPanelType) => (
    <StoryPanel
      key={panel}
      panelType={panel === "CurrentBacklogCombined" ? "Backlog" : panel}
      panelLabelOverride={
        panel === "CurrentBacklogCombined" ? "Current + Backlog" : undefined
      }
      panelTestIdOverride={panel}
      headerAction={(() => {
        const targetPanel = toCreateTargetPanel(panel);
        const isOpen = createTargetPanel === targetPanel;
        if (!projectId) return null;
        return (
          <div className="relative">
            <button
              type="button"
              className="text-xs font-medium text-blue-700"
              onClick={() => openCreateForm(targetPanel)}
            >
              {t("storyMultiPanelScreen.create.button")}
            </button>
            {isOpen ? (
              <div
                role="dialog"
                aria-label={t("storyMultiPanelScreen.create.dialogLabel")}
                className="absolute right-0 top-full z-30 mt-1 w-72 rounded-md border border-gray-200 bg-white p-2 shadow-lg"
              >
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitInlineStory();
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`create-story-type-${targetPanel}`}
                      className="text-xs font-medium text-gray-700"
                    >
                      {t("storyMultiPanelScreen.create.type")}
                    </label>
                    <select
                      id={`create-story-type-${targetPanel}`}
                      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
                      value={createStoryType}
                      disabled={createSubmitting}
                      onChange={(event) => {
                        setCreateStoryType(
                          event.target.value as Exclude<StoryType, "release">,
                        );
                        if (createError) setCreateError(null);
                      }}
                    >
                      {INLINE_CREATABLE_STORY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label
                    className="sr-only"
                    htmlFor={`create-story-${targetPanel}`}
                  >
                    {t("storyMultiPanelScreen.create.title")}
                  </label>
                  <AutoGrowSingleLineTextarea
                    id={`create-story-${targetPanel}`}
                    rows={1}
                    className="w-full resize-none rounded border border-gray-300 px-2 py-1 text-xs"
                    placeholder={t("storyMultiPanelScreen.create.placeholder")}
                    value={createTitle}
                    autoFocus
                    onChange={(value) => {
                      setCreateTitle(value);
                      if (createError) setCreateError(null);
                    }}
                    onEnterKey={() => void submitInlineStory()}
                  />
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
                      onClick={closeCreateForm}
                      disabled={createSubmitting}
                    >
                      {t("storyMultiPanelScreen.create.cancel")}
                    </button>
                    <button
                      type="submit"
                      className="rounded bg-blue-700 px-2 py-1 text-xs text-white disabled:opacity-60"
                      disabled={createSubmitting}
                    >
                      {createSubmitting
                        ? t("storyMultiPanelScreen.create.submitting")
                        : t("storyMultiPanelScreen.create.submit")}
                    </button>
                  </div>
                  {createError ? (
                    <span role="alert" className="text-xs text-red-600">
                      {createError}
                    </span>
                  ) : null}
                </form>
              </div>
            ) : null}
          </div>
        );
      })()}
      stories={
        panel === "CurrentBacklogCombined"
          ? currentBacklogCombinedStories
          : panel === "Current"
            ? currentUnacceptedStories
            : groupedStories[panel]
      }
      acceptedStories={panel === "Current" ? currentAcceptedStories : []}
      iterations={iterations}
      storyCount={
        panel === "CurrentBacklogCombined"
          ? currentBacklogCombinedCount
          : panelDisplayCounts[panel]
      }
      totalPoints={
        panel === "CurrentBacklogCombined"
          ? currentBacklogCombinedTotalPoints
          : panelDisplayTotalPoints[panel]
      }
      iterationPointsByIterationId={
        panel === "CurrentBacklogCombined"
          ? currentBacklogCombinedPointsByIterationId
          : panelIterationPointsById[panel]
      }
      isLoading={
        panel === "CurrentBacklogCombined"
          ? panelQueries.panels.Current.isLoading ||
            panelQueries.panels.Current.isFetching ||
            panelQueries.panels.Backlog.isLoading ||
            panelQueries.panels.Backlog.isFetching
          : panelQueries.panels[panel].isLoading ||
            panelQueries.panels[panel].isFetching
      }
      error={
        panel === "CurrentBacklogCombined"
          ? (panelQueries.panels.Current.error ??
            panelQueries.panels.Backlog.error)
          : panelQueries.panels[panel].error
      }
      onRetry={() => {
        if (panel === "CurrentBacklogCombined") {
          void Promise.all([
            panelQueries.panels.Current.refetch(),
            panelQueries.panels.Backlog.refetch(),
          ]);
          return;
        }
        void panelQueries.panels[panel].refetch();
      }}
      sortable={
        panel === "CurrentBacklogCombined" ||
        panel === "Backlog" ||
        panel === "Icebox" ||
        panel === "Current"
      }
      velocity={
        panel === "Current" && effectiveVelocity > 0 ? effectiveVelocity : null
      }
      replenishmentVelocity={
        (panel === "Backlog" || panel === "CurrentBacklogCombined") &&
        effectiveVelocity > 0
          ? effectiveVelocity
          : null
      }
      currentTotalPoints={
        panel === "Backlog" || panel === "CurrentBacklogCombined"
          ? useLocalFilteredPoints
            ? calculateTotalPoints(groupedStories.Current)
            : (panelQueries.panels.Current.totalPoints ??
              calculateTotalPoints(groupedStories.Current))
          : null
      }
      sprintDurationDays={projectData?.project?.sprintDurationDays ?? 14}
      iterationStartDay={projectData?.project?.iterationStartDay ?? 1}
      currentIterationEndDate={currentIteration?.endDate ?? null}
      currentIterationNumber={currentIteration?.iterationNumber ?? null}
      utilizationOverrideByIterationNumber={
        utilizationOverrideByIterationNumber
      }
      hasNextPage={
        panel === "CurrentBacklogCombined"
          ? panelQueries.panels.Backlog.hasNextPage
          : panelQueries.panels[panel].hasNextPage
      }
      loadingMore={
        panel === "CurrentBacklogCombined"
          ? panelQueries.panels.Backlog.isFetchingNextPage
          : panelQueries.panels[panel].isFetchingNextPage
      }
      onLoadMore={
        panel === "CurrentBacklogCombined"
          ? panelQueries.panels.Backlog.hasNextPage
            ? () => handleLoadMore("Backlog")
            : null
          : panelQueries.panels[panel].hasNextPage
            ? () => handleLoadMore(panel)
            : null
      }
      secondaryHasNextPage={
        panel === "CurrentBacklogCombined"
          ? panelQueries.panels.Current.hasNextPage
          : false
      }
      secondaryLoadingMore={
        panel === "CurrentBacklogCombined"
          ? panelQueries.panels.Current.isFetchingNextPage
          : false
      }
      onSecondaryLoadMore={
        panel === "CurrentBacklogCombined" &&
        panelQueries.panels.Current.hasNextPage
          ? () => handleLoadMore("Current")
          : null
      }
      secondaryLoadMoreLabel={t(
        "storyMultiPanelScreen.loading.loadMoreCurrent",
      )}
      tertiaryHasNextPage={
        panel === "CurrentBacklogCombined"
          ? panelQueries.currentAccepted.hasNextPage
          : false
      }
      tertiaryLoadingMore={
        panel === "CurrentBacklogCombined"
          ? panelQueries.currentAccepted.isFetchingNextPage
          : false
      }
      onTertiaryLoadMore={
        panel === "CurrentBacklogCombined" &&
        panelQueries.currentAccepted.hasNextPage
          ? () => {
              void panelQueries.currentAccepted.fetchNextPage();
            }
          : null
      }
      tertiaryLoadMoreLabel={t("storyMultiPanelScreen.loading.loadMore")}
      acceptedHasNextPage={
        panel === "Current" ? panelQueries.currentAccepted.hasNextPage : false
      }
      acceptedLoadingMore={
        panel === "Current"
          ? panelQueries.currentAccepted.isFetchingNextPage
          : false
      }
      onLoadMoreAccepted={
        panel === "Current" && panelQueries.currentAccepted.hasNextPage
          ? () => {
              void panelQueries.currentAccepted.fetchNextPage();
            }
          : null
      }
      reverseOrder={panel === "Done"}
      preserveStoryOrder={panel === "CurrentBacklogCombined"}
      onIterationUtilizationChange={async (
        iterationNumber: number,
        nextUtilizationPercent: number,
        iterationStartDate?: string | null,
        iterationEndDate?: string | null,
      ) => {
        if (!projectId) return;
        try {
          const response =
            nextUtilizationPercent === 100
              ? await fetch(
                  `/api/projects/${projectId}/iterations/${iterationNumber}/override`,
                  {
                    method: "DELETE",
                  },
                )
              : await fetch(
                  `/api/projects/${projectId}/iterations/${iterationNumber}/override`,
                  {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      sprintUtilizationPercent: nextUtilizationPercent,
                      iterationStartDate:
                        typeof iterationStartDate === "string"
                          ? iterationStartDate
                          : undefined,
                      iterationEndDate:
                        typeof iterationEndDate === "string"
                          ? iterationEndDate
                          : undefined,
                    }),
                  },
                );
          if (!response.ok) {
            if (isAuthError(response.status)) {
              notifySessionExpired();
              return;
            }
            showToast("error", await parseErrorMessage(response));
            return;
          }
          await bootstrapQuery.refetch();
          showToast(
            "success",
            nextUtilizationPercent === 100
              ? t("storyMultiPanelScreen.toast.sprintUtilizationReset")
              : t("storyMultiPanelScreen.toast.sprintUtilizationUpdated"),
          );
        } catch {
          showToast(
            "error",
            t("storyMultiPanelScreen.toast.sprintUtilizationFailed"),
          );
        }
      }}
      {...panelSharedProps}
    />
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="multi-panel-layout"
    >
      <ShortcutHelpDialog
        open={showShortcutHelp}
        items={shortcutHelpItems}
        onClose={() => setShowShortcutHelp(false)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Toolbar (desktop/tablet only) */}
        {breakpoint !== "sm" ? (
          <header className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
            <>
              {projectId ? (
                <Link
                  className="text-sm font-medium text-blue-700"
                  to={projectVelocityDashboardPath(projectId)}
                >
                  {t("storyMultiPanelScreen.nav.velocity")}
                </Link>
              ) : null}
              {projectId ? (
                <Link
                  className="text-sm font-medium text-blue-700"
                  to={projectHistoryPath(projectId)}
                >
                  {t("storyMultiPanelScreen.nav.history")}
                </Link>
              ) : null}
              {projectId ? (
                <Link
                  className="text-sm font-medium text-blue-700"
                  to={projectMembersPath(projectId)}
                >
                  {t("storyMultiPanelScreen.nav.members")}
                </Link>
              ) : null}
              {projectId ? (
                <Link
                  className="text-sm font-medium text-blue-700"
                  to={projectSettingsPath(projectId)}
                >
                  {t("storyMultiPanelScreen.nav.settings")}
                </Link>
              ) : null}

              <div className="ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t(
                        "storyMultiPanelScreen.panelMenu.settingsLabel",
                      )}
                      title={t("storyMultiPanelScreen.panelMenu.settingsLabel")}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300"
                      data-testid="panel-actions-toggle"
                    >
                      <LayoutPanelLeft className="size-4" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="min-w-56"
                    data-testid="panel-actions-menu"
                  >
                    <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {t("storyMultiPanelScreen.panelMenu.panels")}
                    </DropdownMenuLabel>
                    {PANEL_TYPES.map((panel) => (
                      <DropdownMenuCheckboxItem
                        key={panel}
                        checked={visibility[panel]}
                        className="text-xs"
                        onCheckedChange={(checked) => {
                          const on = checked === true;
                          if (on !== visibility[panel]) togglePanel(panel);
                        }}
                        data-testid={`panel-toggle-${panel}`}
                      >
                        {PANEL_LABELS[panel]}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs"
                      onSelect={() => {
                        toggleCurrentBacklogMode();
                      }}
                    >
                      {currentBacklogViewMode === "split"
                        ? t(
                            "storyMultiPanelScreen.panelMenu.combineCurrentBacklog",
                          )
                        : t(
                            "storyMultiPanelScreen.panelMenu.splitCurrentBacklog",
                          )}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Advanced search toggle */}
              <button
                type="button"
                aria-label={t("storyMultiPanelScreen.panelMenu.advancedSearch")}
                title={t("storyMultiPanelScreen.panelMenu.advancedSearch")}
                aria-pressed={showSearchBar}
                data-testid="advanced-search-toggle"
                className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                  showSearchBar
                    ? "bg-blue-700 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
                onClick={() => setShowSearchBar((v) => !v)}
              >
                <Search className="size-4" aria-hidden />
              </button>
            </>
          </header>
        ) : null}

        {/* Advanced search bar & saved searches */}
        {showSearchBar && projectId ? (
          <div className="flex gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex-1">
              <StorySearchBar
                initialFilters={{
                  query: searchQuery,
                  types: activeTypes,
                  unestimatedOnly: showUnestimatedOnly,
                  ownerIds: activeOwners,
                  labels: activeLabels,
                  epicIds: activeEpicIds,
                }}
                memberOptions={memberOptions}
                projectLabels={projectLabels}
                onFiltersChange={handleSearchFiltersChange}
                onSaveSearch={handleSaveSearch}
              />
            </div>
            <div className="w-52 shrink-0">
              <SavedSearches
                projectId={projectId}
                onApply={handleApplySavedSearch}
              />
            </div>
          </div>
        ) : null}

        {pokerStoryId &&
        projectId &&
        pokerSessionState.session?.id &&
        pokerSessionState.session.storyId === pokerStoryId ? (
          <div className="fixed bottom-3 left-3 right-3 z-40 md:bottom-auto md:left-auto md:right-4 md:top-20 md:w-[360px]">
            <div className="rounded-md border border-gray-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                <p className="text-sm font-semibold text-gray-900">
                  {t("storyMultiPanelScreen.poker.title")}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700"
                    onClick={() => setIsPokerPanelCollapsed((v) => !v)}
                  >
                    {isPokerPanelCollapsed ? (
                      <span className="inline-flex items-center gap-1">
                        {t("storyMultiPanelScreen.poker.expand")}{" "}
                        <ChevronDown className="size-3" aria-hidden />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        {t("storyMultiPanelScreen.poker.collapse")}{" "}
                        <ChevronUp className="size-3" aria-hidden />
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-blue-700"
                    onClick={() => {
                      void (async () => {
                        const sessionId = pokerSessionState.session?.id;
                        if (!projectId || !sessionId) return;
                        if (
                          !window.confirm(
                            t("storyMultiPanelScreen.poker.closeConfirm"),
                          )
                        ) {
                          return;
                        }
                        try {
                          const response = await fetch(
                            projectPlanningPokerCloseApiPath(
                              projectId,
                              sessionId,
                            ),
                            { method: "POST" },
                          );
                          if (!response.ok) {
                            showToast(
                              "error",
                              await parseErrorMessage(response),
                            );
                            return;
                          }
                          pokerSessionState.setSession(null);
                          const next = new URLSearchParams(searchParams);
                          next.delete("poker");
                          setSearchParams(next);
                          showToast(
                            "success",
                            t("storyMultiPanelScreen.toast.pokerClosed"),
                          );
                        } catch {
                          showToast(
                            "error",
                            t("storyMultiPanelScreen.toast.pokerCloseFailed"),
                          );
                        }
                      })();
                    }}
                  >
                    {t("storyMultiPanelScreen.poker.close")}
                  </button>
                </div>
              </div>
              {!isPokerPanelCollapsed ? (
                <div className="p-3">
                  <PlanningPokerPanel
                    projectId={projectId}
                    storyId={pokerStoryId}
                    session={pokerSessionState.session}
                    setSession={pokerSessionState.setSession}
                    loading={pokerSessionState.loading}
                    error={pokerSessionState.error}
                    memberOptions={memberOptions}
                    onStoryApplied={(story) => {
                      panelQueries.applyStoryUpdate(story);
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Bulk operations bar */}
        {selectedVisibleStoryIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-blue-200 bg-blue-50 px-4 py-2">
            <span className="text-xs font-medium text-blue-900">
              {t("storyMultiPanelScreen.bulk.selectedCount", {
                count: selectedVisibleStoryIds.length,
              })}
            </span>
            <button
              type="button"
              className="text-xs font-medium text-blue-700 underline"
              onClick={() => {
                if (allVisibleSelected) {
                  setSelectedStoryIds(new Set());
                } else {
                  setSelectedStoryIds(
                    new Set(filteredStories.map((s) => s.id)),
                  );
                }
              }}
            >
              {allVisibleSelected
                ? t("storyMultiPanelScreen.bulk.clearAllSelection")
                : t("storyMultiPanelScreen.bulk.selectAll")}
            </button>
            <button
              type="button"
              className="text-xs font-medium text-blue-700 underline"
              onClick={() => setSelectedStoryIds(new Set())}
            >
              {t("storyMultiPanelScreen.bulk.clearSelection")}
            </button>

            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-900"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as StoryStatus)}
            >
              {STORY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STORY_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-md bg-blue-700 px-2 py-0.5 text-xs font-medium text-white disabled:bg-blue-300"
              onClick={() => void handleBulkStatusChange()}
              disabled={
                selectedVisibleStoryIds.length === 0 ||
                bulkStatusMutation.isPending
              }
            >
              {bulkStatusMutation.isPending
                ? t("storyMultiPanelScreen.bulk.updating")
                : t("storyMultiPanelScreen.bulk.applyStatus")}
            </button>

            {projectLabels.length > 0 ? (
              <>
                <select
                  className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-900"
                  value={bulkLabelName}
                  onChange={(e) => setBulkLabelName(e.target.value)}
                >
                  <option value="">
                    {t("storyMultiPanelScreen.bulk.selectLabel")}
                  </option>
                  {projectLabels.map((label) => (
                    <option key={label.id} value={label.name}>
                      {label.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-md bg-blue-700 px-2 py-0.5 text-xs font-medium text-white disabled:bg-blue-300"
                  onClick={() => void handleBulkAddLabel()}
                  disabled={
                    selectedVisibleStoryIds.length === 0 ||
                    !bulkLabelName ||
                    bulkLabelMutation.isPending
                  }
                >
                  {bulkLabelMutation.isPending
                    ? t("storyMultiPanelScreen.bulk.addingLabel")
                    : t("storyMultiPanelScreen.bulk.addLabel")}
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {/* Loading / Error states */}
        {isBootstrapping ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-gray-600">
              {t("storyMultiPanelScreen.loading.stories")}
            </p>
          </div>
        ) : null}

        {error && retryRequestRef.current ? (
          <div className="p-4">
            <ErrorRetry message={error} onRetry={retryRequestRef.current} />
          </div>
        ) : error ? (
          <p className="p-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        {/* Panel area */}
        {!isBootstrapping &&
        !error &&
        hasActiveFilters &&
        filteredStories.length === 0 &&
        !hasPanelErrors ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-gray-700">
              {t("storyMultiPanelScreen.search.noResults")}
            </p>
            <button
              type="button"
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700"
              onClick={() => setSearchParams(new URLSearchParams())}
            >
              {t("storyMultiPanelScreen.search.clearAll")}
            </button>
          </div>
        ) : null}

        {!isBootstrapping &&
        !error &&
        !(
          hasActiveFilters &&
          filteredStories.length === 0 &&
          !hasPanelErrors
        ) ? (
          <DndContext
            sensors={sensors}
            collisionDetection={storyPanelCollisionDetection}
            onDragStart={handleDndDragStart}
            onDragMove={handleDndDragMove}
            onDragEnd={(event) => {
              resetDndBodyCursor();
              void handleDragEnd(event);
            }}
            onDragCancel={resetDndBodyCursor}
          >
            <div
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              data-testid="panel-container"
            >
              {displayVisiblePanels.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-sm text-gray-500">
                    {t("storyMultiPanelScreen.panelMenu.emptyPanels")}
                  </p>
                </div>
              ) : breakpoint === "sm" ? (
                <>
                  <nav
                    className="flex items-center border-b border-gray-200 bg-white"
                    data-testid="panel-tabs"
                  >
                    {displayVisiblePanels.map((panel) => (
                      <button
                        key={panel}
                        type="button"
                        onClick={() => setActiveTab(panel)}
                        className={`flex-1 px-3 py-2 text-center text-sm font-medium ${
                          (
                            displayVisiblePanels.includes(activeTab)
                              ? activeTab
                              : displayVisiblePanels[0]
                          ) === panel
                            ? "border-b-2 border-blue-600 text-blue-600"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                        data-testid={`panel-tab-${panel}`}
                      >
                        {panel === "CurrentBacklogCombined"
                          ? "Current + Backlog"
                          : PANEL_LABELS[panel]}
                      </button>
                    ))}
                    <div className="pr-2">
                      <DropdownMenu
                        open={mobileMenuOpen}
                        onOpenChange={setMobileMenuOpen}
                      >
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={t(
                              "storyMultiPanelScreen.panelMenu.mobileMenu",
                            )}
                            aria-controls="mobile-sub-header-menu"
                            aria-expanded={mobileMenuOpen}
                            title={t(
                              "storyMultiPanelScreen.panelMenu.mobileMenu",
                            )}
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300"
                            data-testid="mobile-sub-header-menu-toggle"
                          >
                            <Menu className="size-4" aria-hidden />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          id="mobile-sub-header-menu"
                          align="end"
                          className="min-w-64"
                          data-testid="mobile-sub-header-menu"
                        >
                          {projectId ? (
                            <>
                              <DropdownMenuItem asChild>
                                <Link
                                  to={projectVelocityDashboardPath(projectId)}
                                  onClick={() => setMobileMenuOpen(false)}
                                >
                                  {t("storyMultiPanelScreen.nav.velocity")}
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link
                                  to={projectHistoryPath(projectId)}
                                  onClick={() => setMobileMenuOpen(false)}
                                >
                                  {t("storyMultiPanelScreen.nav.history")}
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link
                                  to={projectMembersPath(projectId)}
                                  onClick={() => setMobileMenuOpen(false)}
                                >
                                  {t("storyMultiPanelScreen.nav.members")}
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link
                                  to={projectSettingsPath(projectId)}
                                  onClick={() => setMobileMenuOpen(false)}
                                >
                                  {t("storyMultiPanelScreen.nav.settings")}
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          ) : null}
                          <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            {t("storyMultiPanelScreen.panelMenu.panels")}
                          </DropdownMenuLabel>
                          {PANEL_TYPES.map((panel) => (
                            <DropdownMenuCheckboxItem
                              key={panel}
                              checked={visibility[panel]}
                              className="text-xs"
                              onCheckedChange={(checked) => {
                                const on = checked === true;
                                if (on !== visibility[panel])
                                  togglePanel(panel);
                                setMobileMenuOpen(false);
                              }}
                              data-testid={`panel-toggle-${panel}`}
                            >
                              {PANEL_LABELS[panel]}
                            </DropdownMenuCheckboxItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-xs"
                            onSelect={() => {
                              toggleCurrentBacklogMode();
                              setMobileMenuOpen(false);
                            }}
                          >
                            {currentBacklogViewMode === "split"
                              ? t(
                                  "storyMultiPanelScreen.panelMenu.combineCurrentBacklog",
                                )
                              : t(
                                  "storyMultiPanelScreen.panelMenu.splitCurrentBacklog",
                                )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-xs"
                            onSelect={() => {
                              setShowSearchBar((v) => !v);
                              setMobileMenuOpen(false);
                            }}
                          >
                            {showSearchBar
                              ? t(
                                  "storyMultiPanelScreen.panelMenu.closeAdvancedSearch",
                                )
                              : t(
                                  "storyMultiPanelScreen.panelMenu.openAdvancedSearch",
                                )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </nav>
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    {renderPanel(
                      displayVisiblePanels.includes(activeTab)
                        ? activeTab
                        : displayVisiblePanels[0],
                    )}
                  </div>
                </>
              ) : breakpoint === "md" ? (
                <div className="grid min-h-0 min-w-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)] overflow-hidden">
                  {displayVisiblePanels.map((panel) => (
                    <div
                      key={panel}
                      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-gray-200 last:border-r-0"
                    >
                      {renderPanel(panel)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                  {displayVisiblePanels.map((panel) => renderPanel(panel))}
                </div>
              )}
            </div>
          </DndContext>
        ) : null}
      </div>

      {showReleaseMarkerDialog ? (
        <ReleaseMarkerCreateDialog
          submitting={creatingReleaseMarker}
          onSubmit={({ name, releaseDate }) => {
            void handleCreateReleaseMarker(name, releaseDate);
          }}
          onClose={() => setShowReleaseMarkerDialog(false)}
        />
      ) : null}
      <StoryDeleteConfirmDialog
        isOpen={pendingDeleteStory !== null}
        storyTitle={pendingDeleteStory?.title ?? ""}
        isDeleting={
          pendingDeleteStory !== null &&
          deletingStoryId === pendingDeleteStory.id
        }
        onCancel={() => setPendingDeleteStory(null)}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
}
