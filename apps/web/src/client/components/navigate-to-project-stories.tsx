import { Navigate, useLocation, useParams } from "react-router";
import { projectStoriesPath } from "../lib/story-routes";

export function NavigateToProjectStories() {
  const { projectId } = useParams();
  const { search, hash } = useLocation();
  if (!projectId) return <Navigate to="/projects" replace />;
  return (
    <Navigate to={`${projectStoriesPath(projectId)}${search}${hash}`} replace />
  );
}
