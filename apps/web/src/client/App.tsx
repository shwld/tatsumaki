import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router";

import { Layout } from "./components/layout";
import { PageTitle } from "./components/page-title";
import { OnboardingGate } from "./components/onboarding-gate";
import { AuthErrorProvider } from "./contexts/auth-error-context";
import { ProjectUsageScope } from "./contexts/project-usage-context";
import { ToastProvider } from "./contexts/toast-context";
import { popReturnTo } from "./lib/api-error";
import { LoginScreen } from "./screens/login-screen";
import { ProjectCreateCompleteScreen } from "./screens/project-create-complete-screen";
import { ProjectCreateScreen } from "./screens/project-create-screen";
import { ProjectListScreen } from "./screens/project-list-screen";
import {
  ProjectEpicDetailScreen,
  ProjectEpicsScreen,
} from "./screens/project-epics-screen";
import { ProjectStoryMapsScreen } from "./screens/project-story-maps-screen";
import { StoryMapEditScreen } from "./screens/story-map-edit-screen";
import { StoryMapMetaEditScreen } from "./screens/story-map-meta-edit-screen";
import { ProjectLabelsScreen } from "./screens/project-labels-screen";
import { ProjectInvitationsScreen } from "./screens/project-invitations-screen";
import { ProjectMembersScreen } from "./screens/project-members-screen";
import { ProjectApiKeysScreen } from "./screens/project-api-keys-screen";
import { ArtifactDetailScreen } from "./screens/artifact-detail-screen";
import { ArtifactListScreen } from "./screens/artifact-list-screen";
import { StoryEditScreen } from "./screens/story-edit-screen";
import { ProjectSettingsScreen } from "./screens/project-settings-screen";
import { ProjectVelocityScreen } from "./screens/project-velocity-screen";
import { NavigateToProjectStories } from "./components/navigate-to-project-stories";
import { StoryDetailScreen } from "./screens/story-detail-screen";
import { StoryMultiPanelScreen } from "./screens/story-multi-panel-screen";
import { AccountScreen } from "./screens/account-screen";
import { InstallScreen } from "./screens/install-screen";
import { ProjectHistoryScreen } from "./screens/project-history-screen";
import { ProjectInvitationAcceptScreen } from "./screens/project-invitation-accept-screen";
import { SingleUseInvitationAcceptScreen } from "./screens/single-use-invitation-accept-screen";

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
      <Route
        path="/login"
        element={
          <PageTitle titleKey="loginScreen.login">
            <LoginScreen />
          </PageTitle>
        }
      />
      <Route
        path="*"
        element={
          <AuthErrorProvider>
            <ToastProvider>
              <ReturnToRedirect />
              <OnboardingGate>
                <Layout>
                  <ProjectUsageScope>
                    <Routes>
                      <Route
                        path="/invite"
                        element={
                          <PageTitle titleKey="pageTitle.projectInvitation">
                            <SingleUseInvitationAcceptScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/new"
                        element={
                          <PageTitle titleKey="projectCreateScreen.title">
                            <ProjectCreateScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/new/complete"
                        element={
                          <PageTitle titleKey="projectCreateCompleteScreen.title">
                            <ProjectCreateCompleteScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects"
                        element={
                          <PageTitle titleKey="projectListScreen.title">
                            <ProjectListScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/members"
                        element={
                          <PageTitle titleKey="projectMembersScreen.title">
                            <ProjectMembersScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/members/invitations"
                        element={
                          <PageTitle titleKey="projectInvitationsScreen.title">
                            <ProjectInvitationsScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/labels"
                        element={
                          <PageTitle titleKey="projectLabelsScreen.title">
                            <ProjectLabelsScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/epics"
                        element={
                          <PageTitle titleKey="projectEpicsScreen.title">
                            <ProjectEpicsScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/epics/:labelId"
                        element={
                          <PageTitle titleKey="pageTitle.epicDetail">
                            <ProjectEpicDetailScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/story-maps"
                        element={
                          <PageTitle titleKey="projectStoryMapsScreen.title">
                            <ProjectStoryMapsScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/story-maps/:mapId"
                        element={
                          <PageTitle titleKey="projectStoryMapsScreen.title">
                            <StoryMapEditScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/story-maps/:mapId/edit"
                        element={
                          <PageTitle titleKey="pageTitle.storyMapEdit">
                            <StoryMapMetaEditScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/invitations/:invitationId/accept"
                        element={
                          <PageTitle titleKey="pageTitle.projectInvitation">
                            <ProjectInvitationAcceptScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/settings"
                        element={
                          <PageTitle titleKey="projectSettingsScreen.title">
                            <ProjectSettingsScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/api-keys"
                        element={
                          <PageTitle titleKey="pageTitle.apiKeys">
                            <ProjectApiKeysScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/velocity"
                        element={
                          <PageTitle titleKey="projectVelocityScreen.title">
                            <ProjectVelocityScreen />
                          </PageTitle>
                        }
                      />{" "}
                      <Route
                        path="/projects/:projectId/history"
                        element={
                          <PageTitle titleKey="projectHistoryScreen.title">
                            <ProjectHistoryScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/artifacts"
                        element={
                          <PageTitle titleKey="artifactScreens.list.title">
                            <ArtifactListScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/artifacts/:artifactId"
                        element={
                          <PageTitle titleKey="pageTitle.artifactDetail">
                            <ArtifactDetailScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/artifacts/:artifactId/versions/:version"
                        element={
                          <PageTitle titleKey="pageTitle.artifactDetail">
                            <ArtifactDetailScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/account"
                        element={
                          <PageTitle titleKey="layout.menu.account">
                            <AccountScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/install"
                        element={
                          <PageTitle titleKey="installScreen.title">
                            <InstallScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId"
                        element={
                          <PageTitle titleKey="projectNav.stories">
                            <StoryMultiPanelScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/stories"
                        element={<NavigateToProjectStories />}
                      />
                      <Route
                        path="/projects/:projectId/stories/:storyNumber"
                        element={
                          <PageTitle titleKey="pageTitle.storyDetail">
                            <StoryDetailScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/planning-poker"
                        element={
                          <PageTitle titleKey="pageTitle.notFound">
                            <NotFoundScreen />
                          </PageTitle>
                        }
                      />
                      <Route
                        path="/projects/:projectId/stories/new"
                        element={<NavigateToProjectStories />}
                      />
                      <Route
                        path="/projects/:projectId/stories/:storyNumber/edit"
                        element={
                          <PageTitle titleKey="storyEditScreen.title">
                            <StoryEditScreen />
                          </PageTitle>
                        }
                      />
                      {/* Legacy redirects — single-line for lint-screenshot-coverage */}
                      <Route
                        path="/projects/:projectId/stories/panels"
                        element={<NavigateToProjectStories />}
                      />
                      <Route
                        path="/projects/:projectId/stories/backlog"
                        element={<NavigateToProjectStories />}
                      />
                      <Route
                        path="/projects/:projectId/stories/board"
                        element={<NavigateToProjectStories />}
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
                  </ProjectUsageScope>
                </Layout>
              </OnboardingGate>
            </ToastProvider>
          </AuthErrorProvider>
        }
      />
    </Routes>
  );
}
