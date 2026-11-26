import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMatch } from "react-router";
import { useAuthError } from "./auth-error-context";
import { ProjectUsageBanner } from "../components/project-usage-banner";
import type {
  ProjectAccessState,
  ProjectUsageDeadlineReason,
} from "../../domain/entities/project-usage";

export type ProjectUsageViewState =
  | "loading"
  | "available"
  | "limited"
  | "read_only"
  | "unknown";

export type ProjectUsageView = {
  projectId: string;
  state: ProjectUsageViewState;
  role: "owner" | "member" | "viewer" | null;
  deadline: { until: string; untilReason: ProjectUsageDeadlineReason } | null;
  refresh: () => void;
};

const POLL_INTERVAL_MS = 60_000;

const ProjectUsageContext = createContext<ProjectUsageView | null>(null);

type Loaded = Omit<ProjectUsageView, "refresh" | "projectId">;

const UNKNOWN: Loaded = { state: "unknown", role: null, deadline: null };

const toLoaded = (data: {
  access?: Partial<ProjectAccessState>;
  role?: ProjectUsageView["role"];
}): Loaded => {
  const access = data.access as ProjectAccessState | undefined;
  const role = data.role ?? null;
  switch (access?.kind) {
    case "limited":
      return {
        state: "limited",
        role,
        deadline: { until: access.until, untilReason: access.untilReason },
      };
    case "available":
    case "read_only":
    case "unknown":
      return { state: access.kind, role, deadline: null };
    default:
      return UNKNOWN;
  }
};

// ADR-0016: a state that cannot be read is never treated as available.
// Writes stay off and viewing continues.
export function ProjectUsageScope({ children }: { children: ReactNode }) {
  const match = useMatch("/projects/:projectId/*");
  const rawProjectId = match?.params.projectId;
  const projectId = rawProjectId === "new" ? undefined : rawProjectId;
  const [loaded, setLoaded] = useState<{
    projectId: string;
    value: Loaded;
  } | null>(null);
  const runRef = useRef<(() => void) | null>(null);
  const refresh = useCallback(() => runRef.current?.(), []);
  const { notifySessionExpired } = useAuthError();

  useEffect(() => {
    if (!projectId) return;
    let ignore = false;
    let issued = 0;
    let applied = 0;
    const run = async () => {
      const seq = ++issued;
      let value: Loaded = UNKNOWN;
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/usage`,
        );
        if (response.ok) {
          value = toLoaded(
            (await response.json()) as Parameters<typeof toLoaded>[0],
          );
        } else if (response.status === 401) {
          notifySessionExpired();
        }
      } catch {
        // keep the fail-closed "unknown" value
      }
      if (ignore || seq < applied) return;
      applied = seq;
      setLoaded({ projectId, value });
    };
    runRef.current = () => void run();
    void run();
    const timer = window.setInterval(() => void run(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ignore = true;
      runRef.current = null;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [projectId, notifySessionExpired]);

  const current =
    loaded && loaded.projectId === projectId ? loaded.value : null;
  const value = useMemo<ProjectUsageView | null>(() => {
    if (!projectId) return null;
    const base: Loaded = current ?? {
      state: "loading",
      role: null,
      deadline: null,
    };
    return { ...base, projectId, refresh };
  }, [projectId, current, refresh]);

  return (
    <ProjectUsageContext.Provider value={value}>
      {value ? <ProjectUsageBanner usage={value} /> : null}
      {children}
    </ProjectUsageContext.Provider>
  );
}

export function useProjectUsage(): ProjectUsageView | null {
  return useContext(ProjectUsageContext);
}

export function useProjectReadOnly(): boolean {
  const usage = useProjectUsage();
  return (
    usage?.state === "loading" ||
    usage?.state === "read_only" ||
    usage?.state === "unknown"
  );
}
