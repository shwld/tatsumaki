import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMatch } from "react-router";
import { ProjectBillingBanner } from "../components/project-billing-banner";

export type ProjectBillingState =
  | "loading"
  | "active"
  | "grace"
  | "suspended"
  | "unknown";

export type ProjectBilling = {
  state: ProjectBillingState;
  role: "owner" | "member" | "viewer" | null;
  validUntil: string | null;
  refresh: () => void;
};

const POLL_INTERVAL_MS = 60_000;

const ProjectBillingContext = createContext<ProjectBilling | null>(null);

type Loaded = Omit<ProjectBilling, "refresh">;

// ADR-0015: a state that cannot be read is never treated as active.
// Writes stay off and viewing continues.
export function ProjectBillingScope({ children }: { children: ReactNode }) {
  const match = useMatch("/projects/:projectId/*");
  const rawProjectId = match?.params.projectId;
  const projectId = rawProjectId === "new" ? undefined : rawProjectId;
  const [loaded, setLoaded] = useState<{
    projectId: string;
    value: Loaded;
  } | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!projectId) return;
    let ignore = false;
    const run = async () => {
      let value: Loaded = { state: "unknown", role: null, validUntil: null };
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/billing-state`,
        );
        if (response.ok) {
          const data = (await response.json()) as Partial<Loaded>;
          if (
            data.state === "active" ||
            data.state === "grace" ||
            data.state === "suspended" ||
            data.state === "unknown"
          ) {
            value = {
              state: data.state,
              role: data.role ?? null,
              validUntil: data.validUntil ?? null,
            };
          }
        } else if (response.status === 401 || response.status === 403) {
          return;
        }
      } catch {
        // keep the fail-closed "unknown" value
      }
      if (!ignore) setLoaded({ projectId, value });
    };
    void run();
    const timer = window.setInterval(() => void run(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ignore = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [projectId, tick]);

  const current =
    loaded && loaded.projectId === projectId ? loaded.value : null;
  const value = useMemo<ProjectBilling | null>(() => {
    if (!projectId) return null;
    const base: Loaded = current ?? {
      state: "loading",
      role: null,
      validUntil: null,
    };
    return { ...base, refresh };
  }, [projectId, current, refresh]);

  return (
    <ProjectBillingContext.Provider value={value}>
      {value ? <ProjectBillingBanner billing={value} /> : null}
      {children}
    </ProjectBillingContext.Provider>
  );
}

export function useProjectBilling(): ProjectBilling | null {
  return useContext(ProjectBillingContext);
}

export function useProjectReadOnly(): boolean {
  const billing = useProjectBilling();
  return (
    billing?.state === "loading" ||
    billing?.state === "suspended" ||
    billing?.state === "unknown"
  );
}
