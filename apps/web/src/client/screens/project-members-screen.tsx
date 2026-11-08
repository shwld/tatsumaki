import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { ActorLabel } from "../components/actor-label";
import { PermissionDenied } from "../components/permission-denied";
import { ProjectPage } from "../components/project-page";
import { ProjectSection } from "../components/project-section";
import { MEMBER_ROLES, useProjectMembers } from "../hooks/use-project-members";
import { isAuthError } from "../lib/api-error";
import { parseErrorMessage } from "../lib/parse-error-message";
import { projectInvitationsPath } from "../lib/story-routes";
import type { ProjectMemberEntry, ProjectMemberRole } from "../types/project";

export function ProjectMembersScreen() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const {
    members,
    setMembers,
    forbidden,
    canManageRoles,
    requestError,
    setRequestError,
    isLoading,
    notifySessionExpired,
  } = useProjectMembers(projectId);

  const handleRoleChange = async (
    member: ProjectMemberEntry,
    role: ProjectMemberRole,
  ) => {
    if (!projectId) {
      return;
    }

    setRequestError(null);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/members/${member.userId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ role }),
        },
      );

      if (!response.ok) {
        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        setRequestError(await parseErrorMessage(response));
        return;
      }

      const data = (await response.json()) as { member?: ProjectMemberEntry };
      if (data.member) {
        const updated = data.member;
        setMembers((current) =>
          current.map((item) =>
            item.userId === member.userId ? { ...item, ...updated } : item,
          ),
        );
      }
    } catch {
      setRequestError(t("projectMembersScreen.roleUpdateError"));
    }
  };

  if (forbidden) {
    return <PermissionDenied message={forbidden} />;
  }

  return (
    <ProjectPage
      title={t("projectMembersScreen.title")}
      actions={
        projectId ? (
          <Link
            to={projectInvitationsPath(projectId)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {t("projectMembersScreen.manageInvitations")}
          </Link>
        ) : null
      }
    >
      <div className="space-y-6">
        {isLoading ? (
          <p className="mt-5 text-gray-600">
            {t("projectMembersScreen.loading")}
          </p>
        ) : null}

        {requestError ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {requestError}
          </p>
        ) : null}

        {!isLoading ? (
          <ProjectSection title={t("projectMembersScreen.members.title")}>
            {members.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">
                {t("projectMembersScreen.members.empty")}
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {members.map((member) => (
                  <li
                    key={member.userId}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        <ActorLabel member={member} actorName={null} />
                      </p>
                      <p className="text-xs text-gray-500">
                        {t("projectMembersScreen.members.joined", {
                          date: new Date(member.createdAt).toLocaleString(),
                        })}
                      </p>
                    </div>

                    <select
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      aria-label={t("projectMembersScreen.members.roleOf")}
                      value={member.role}
                      onChange={(event) => {
                        handleRoleChange(
                          member,
                          event.target.value as ProjectMemberRole,
                        );
                      }}
                      disabled={!canManageRoles}
                    >
                      {MEMBER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {t(`projectMembersScreen.roles.${role}`)}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </ProjectSection>
        ) : null}
      </div>
    </ProjectPage>
  );
}
