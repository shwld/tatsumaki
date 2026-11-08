import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { PermissionDenied } from "../components/permission-denied";
import { ProjectPage } from "../components/project-page";
import { ProjectSection } from "../components/project-section";
import { MEMBER_ROLES, useProjectMembers } from "../hooks/use-project-members";
import { isAuthError } from "../lib/api-error";
import { parseErrorMessage } from "../lib/parse-error-message";
import { projectMembersPath } from "../lib/story-routes";
import type { ProjectInvitation, ProjectMemberRole } from "../types/project";

export function ProjectInvitationsScreen() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const {
    members,
    invitations,
    setInvitations,
    forbidden,
    canManageRoles,
    requestError,
    setRequestError,
    isLoading,
    notifySessionExpired,
  } = useProjectMembers(projectId);
  const [targetEmail, setTargetEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ProjectMemberRole>("member");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const invitationTarget = (invitation: ProjectInvitation): string => {
    if (invitation.targetEmail) return invitation.targetEmail;
    if (invitation.invitationType === "single_use") {
      return t("projectInvitationsScreen.list.singleUse");
    }
    const member = members.find(
      (item) => item.userId === invitation.targetUserId,
    );
    return member?.displayName ?? t("actorLabel.unknownUser");
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!projectId) {
      setValidationError(t("projectMembersScreen.missingProjectId"));
      return;
    }

    setValidationError(null);
    setRequestError(null);

    const trimmedEmail = targetEmail.trim();
    if (!trimmedEmail) {
      setValidationError(
        t("projectInvitationsScreen.validation.emailRequired"),
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/invitations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: trimmedEmail, role: inviteRole }),
      });

      if (!response.ok) {
        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }
        const errorMessage = await parseErrorMessage(response);
        if (
          response.status === 400 ||
          response.status === 403 ||
          response.status === 409
        ) {
          setValidationError(errorMessage);
          return;
        }

        setRequestError(errorMessage);
        return;
      }

      const data = (await response.json()) as {
        invitation?: ProjectInvitation;
      };
      if (data.invitation) {
        const created = data.invitation;
        setInvitations((current) => [...current, created]);
      }
      setTargetEmail("");
    } catch {
      setRequestError(t("projectInvitationsScreen.invitationError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateLink = async () => {
    if (!projectId) return;
    setRequestError(null);
    setCreatedLink(null);
    setIsCreatingLink(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/invitation-links`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: inviteRole }),
        },
      );
      if (!response.ok) {
        setRequestError(await parseErrorMessage(response));
        return;
      }
      const data = (await response.json()) as {
        invitation: ProjectInvitation;
        url: string;
      };
      setInvitations((current) => [...current, data.invitation]);
      setCreatedLink(data.url);
    } catch {
      setRequestError(t("projectInvitationsScreen.invitationError"));
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleRevokeLink = async (invitationId: string) => {
    if (!projectId) return;
    const response = await fetch(
      `/api/projects/${projectId}/invitation-links/${invitationId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      setRequestError(await parseErrorMessage(response));
      return;
    }
    setInvitations((current) =>
      current.map((invitation) =>
        invitation.id === invitationId
          ? { ...invitation, status: "cancelled" }
          : invitation,
      ),
    );
  };

  if (forbidden) {
    return <PermissionDenied message={forbidden} />;
  }

  return (
    <ProjectPage
      title={t("projectInvitationsScreen.title")}
      actions={
        projectId ? (
          <Link
            to={projectMembersPath(projectId)}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800"
          >
            {t("projectInvitationsScreen.backToMembers")}
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

        {validationError ? (
          <p className="mt-5 text-sm text-red-600" role="alert">
            {validationError}
          </p>
        ) : null}

        {requestError ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {requestError}
          </p>
        ) : null}

        {!isLoading ? (
          <>
            <ProjectSection title={t("projectInvitationsScreen.invite.title")}>
              <p className="mt-1 text-sm text-gray-600">
                {t("projectInvitationsScreen.invite.description")}
              </p>

              <form className="mt-4 space-y-3" onSubmit={handleInvite}>
                <div>
                  <label
                    className="block text-sm font-medium text-gray-700"
                    htmlFor="invite-email"
                  >
                    {t("projectInvitationsScreen.invite.email")}
                  </label>
                  <input
                    id="invite-email"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    type="email"
                    value={targetEmail}
                    onChange={(event) => {
                      setTargetEmail(event.target.value);
                    }}
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-gray-700"
                    htmlFor="invite-role"
                  >
                    {t("projectInvitationsScreen.invite.role")}
                  </label>
                  <select
                    id="invite-role"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={inviteRole}
                    onChange={(event) => {
                      setInviteRole(event.target.value as ProjectMemberRole);
                    }}
                  >
                    {MEMBER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {t(`projectMembersScreen.roles.${role}`)}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-blue-400"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? t("projectInvitationsScreen.invite.inviting")
                    : t("projectInvitationsScreen.invite.send")}
                </button>
              </form>
              <div className="mt-5 border-t border-gray-200 pt-4">
                <p className="text-sm text-gray-600">
                  {t("projectInvitationsScreen.invite.linkDescription")}
                </p>
                <button
                  type="button"
                  className="mt-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50"
                  disabled={isCreatingLink || !canManageRoles}
                  onClick={handleCreateLink}
                >
                  {isCreatingLink
                    ? t("projectInvitationsScreen.invite.creatingLink")
                    : t("projectInvitationsScreen.invite.createLink")}
                </button>
                {createdLink ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                      aria-label={t(
                        "projectInvitationsScreen.invite.createdLink",
                      )}
                      readOnly
                      value={createdLink}
                    />
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                      onClick={() => navigator.clipboard.writeText(createdLink)}
                    >
                      {t("projectInvitationsScreen.invite.copyLink")}
                    </button>
                  </div>
                ) : null}
              </div>
            </ProjectSection>

            <ProjectSection title={t("projectInvitationsScreen.list.title")}>
              {invitations.length === 0 ? (
                <p className="mt-2 text-sm text-gray-600">
                  {t("projectInvitationsScreen.list.empty")}
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {invitations.map((invitation) => {
                    const isExpired =
                      invitation.status === "pending" &&
                      new Date(invitation.expiresAt).getTime() < Date.now();
                    const status = isExpired ? "expired" : invitation.status;
                    return (
                      <li
                        key={invitation.id}
                        className="rounded-md border border-gray-100 bg-gray-50 p-3"
                      >
                        <p className="text-sm text-gray-900">
                          {t("projectInvitationsScreen.list.target", {
                            target: invitationTarget(invitation),
                          })}
                        </p>
                        <p className="text-xs text-gray-600">
                          {t("projectInvitationsScreen.list.metadata", {
                            role: t(
                              `projectMembersScreen.roles.${invitation.role}`,
                            ),
                            status: t(
                              `projectInvitationsScreen.status.${status}`,
                            ),
                          })}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t("projectInvitationsScreen.list.expires", {
                            date: new Date(
                              invitation.expiresAt,
                            ).toLocaleString(),
                          })}
                        </p>
                        {invitation.invitationType === "single_use" &&
                        invitation.status === "pending" &&
                        canManageRoles ? (
                          <button
                            type="button"
                            className="mt-2 text-xs font-semibold text-red-700 hover:underline"
                            onClick={() => handleRevokeLink(invitation.id)}
                          >
                            {t("projectInvitationsScreen.list.revoke")}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </ProjectSection>
          </>
        ) : null}
      </div>
    </ProjectPage>
  );
}
