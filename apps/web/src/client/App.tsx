import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router";

import { Layout } from "./components/layout";
import { AuthErrorProvider } from "./contexts/auth-error-context";
import { ToastProvider } from "./contexts/toast-context";
import { popReturnTo } from "./lib/api-error";
import { LoginScreen } from "./screens/login-screen";
import { ProjectCreateScreen } from "./screens/project-create-screen";
import { ProjectListScreen } from "./screens/project-list-screen";
import { ProjectMembersScreen } from "./screens/project-members-screen";
import { ProjectApiKeysScreen } from "./screens/project-api-keys-screen";
import { StoryEditScreen } from "./screens/story-edit-screen";
import { ProjectSettingsScreen } from "./screens/project-settings-screen";
import { ProjectVelocityScreen } from "./screens/project-velocity-screen";
import { StoryDetailScreen } from "./screens/story-detail-screen";
import { StoryMultiPanelScreen } from "./screens/story-multi-panel-screen";
import { AccountScreen } from "./screens/account-screen";
import { ProjectHistoryScreen } from "./screens/project-history-screen";
import { ProjectInvitationAcceptScreen } from "./screens/project-invitation-accept-screen";

function ReturnToRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const returnTo = popReturnTo();
    if (returnTo && returnTo !== "/" && returnTo !== window.location.pathname) {
      navigate(returnTo, { replace: true });
    }
  }, [navigate]);

  return null;
}

function NotFoundScreen() {
  return (
    <div className="p-4 text-sm text-gray-700" role="status">
      404 Not Found
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route
        path="*"
        element={
          <AuthErrorProvider>
            <ToastProvider>
              <ReturnToRedirect />
              <Layout>
                <Routes>
                  <Route
                    path="/projects/new"
                    element={<ProjectCreateScreen />}
                  />
                  <Route path="/projects" element={<ProjectListScreen />} />
                  <Route
                    path="/projects/:projectId/members"
                    element={<ProjectMembersScreen />}
                  />
                  <Route
                    path="/projects/:projectId/invitations/:invitationId/accept"
                    element={<ProjectInvitationAcceptScreen />}
                  />
                  <Route
                    path="/projects/:projectId/settings"
                    element={<ProjectSettingsScreen />}
                  />
                  <Route
                    path="/projects/:projectId/api-keys"
                    element={<ProjectApiKeysScreen />}
                  />
                  <Route
                    path="/projects/:projectId/velocity"
                    element={<ProjectVelocityScreen />}
                  />{" "}
                  <Route
                    path="/projects/:projectId/history"
                    element={<ProjectHistoryScreen />}
                  />
                  <Route path="/account" element={<AccountScreen />} />
                  <Route
                    path="/projects/:projectId/stories"
                    element={<StoryMultiPanelScreen />}
                  />
                  <Route
                    path="/projects/:projectId/stories/:storyNumber"
                    element={<StoryDetailScreen />}
                  />
                  <Route
                    path="/projects/:projectId/planning-poker"
                    element={<NotFoundScreen />}
                  />
                  <Route
                    path="/projects/:projectId/stories/new"
                    element={<Navigate to=".." replace />}
                  />
                  <Route
                    path="/projects/:projectId/stories/:storyNumber/edit"
                    element={<StoryEditScreen />}
                  />
                  {/* Legacy redirects — single-line for lint-screenshot-coverage */}
                  <Route
                    path="/projects/:projectId/stories/panels"
                    element={<Navigate to=".." replace />}
                  />
                  <Route
                    path="/projects/:projectId/stories/backlog"
                    element={<Navigate to=".." replace />}
                  />
                  <Route
                    path="/projects/:projectId/stories/board"
                    element={<Navigate to=".." replace />}
                  />
                  <Route
                    path="/my-work"
                    element={<Navigate to="/projects" replace />}
                  />
                  <Route
                    path="/stories/*"
                    element={<Navigate to="/projects" replace />}
                  />
                  <Route
                    path="/"
                    element={<Navigate to="/projects" replace />}
                  />
                  <Route
                    path="*"
                    element={<Navigate to="/projects" replace />}
                  />
                </Routes>
              </Layout>
            </ToastProvider>
          </AuthErrorProvider>
        }
      />
    </Routes>
  );
}
