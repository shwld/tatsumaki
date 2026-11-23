import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useMatch } from "react-router";
import type { ProjectsResponse } from "../types/project";

const ProjectNameContext = createContext<{
  projectId?: string;
  name: string | null;
  refresh: () => void;
}>({ name: null, refresh: () => {} });

export function useProjectName() {
  return useContext(ProjectNameContext);
}

const projectNameCache = new Map<string, string>();

export function resetProjectNameCacheForTests(): void {
  projectNameCache.clear();
}

export function ProjectNameScope({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const match = useMatch("/projects/:projectId/*");
  const isInvitationAccept = useMatch("/projects/:projectId/invitations/*");
  const routeProjectId = match?.params.projectId;
  const projectId =
    routeProjectId === "new" || isInvitationAccept ? undefined : routeProjectId;
  const [loaded, setLoaded] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    if (!projectId) return;
    let ignore = false;
    const load = async () => {
      try {
        const response = await fetch("/api/projects");
        if (!response.ok) return;
        const data = (await response.json()) as ProjectsResponse;
        const found = Array.isArray(data.projects)
          ? data.projects.find((item) => item.id === projectId)?.name
          : undefined;
        if (!ignore && found) {
          projectNameCache.set(projectId, found);
          setLoaded({ id: projectId, name: found });
        }
      } catch {
        return;
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [projectId, pathname, revision]);

  const name = !projectId
    ? null
    : loaded?.id === projectId
      ? loaded.name
      : (projectNameCache.get(projectId) ?? null);
  return (
    <ProjectNameContext.Provider value={{ projectId, name, refresh }}>
      {children}
    </ProjectNameContext.Provider>
  );
}
