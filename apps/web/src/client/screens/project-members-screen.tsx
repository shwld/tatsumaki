import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { PermissionDenied } from "../components/permission-denied";
import { ProjectStoryBreadcrumb } from "../components/project-story-breadcrumb";
import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError, isForbiddenError } from "../lib/api-error";
import { parseErrorMessage } from "../lib/parse-error-message";
import type {
  ProjectInvitation,
  ProjectMember,
  ProjectMemberRole,
} from "../types/project";

type ProjectMembersResponse = {
  currentMemberRole?: ProjectMemberRole;
  members?: ProjectMember[];
  invitations?: ProjectInvitation[];
};

const MEMBER_ROLES: ProjectMemberRole[] = ["owner", "member", "viewer"];

export function ProjectMembersScreen() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { notifySessionExpired } = useAuthError();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [currentMemberRole, setCurrentMemberRole] =
    useState<ProjectMemberRole | null>(null);
  const [targetEmail, setTargetEmail] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<ProjectMemberRole>("member");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setIsLoading(false);
      setRequestError(t("projectMembersScreen.missingProjectId"));
      return;
    }

    let ignore = false;

    const run = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/members`);
        if (!response.ok) {
          if (!ignore && isAuthError(response.status)) {
            notifySessionExpired();
            return;
          }
          if (!ignore && isForbiddenError(response.status)) {
            setForbidden(await parseErrorMessage(response));
            return;
          }
          if (!ignore) {
            setRequestError(await parseErrorMessage(response));
          }
          return;
        }

        const data = (await response.json()) as ProjectMembersResponse;

        if (!ignore) {
          setCurrentMemberRole(
            data.currentMemberRole &&
              MEMBER_ROLES.includes(data.currentMemberRole)
              ? data.currentMemberRole
              : null,
          );
          setMembers(Array.isArray(data.members) ? data.members : []);
          setInvitations(
            Array.isArray(data.invitations) ? data.invitations : [],
          );
        }
      } catch {
        if (!ignore) {
          setRequestError(t("projectMembersScreen.loadError"));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    run();

    return () => {
      ignore = true;
    };
  }, [projectId]);

  const canManageRoles = useMemo(() => {
    return currentMemberRole === "owner";
  }, [currentMemberRole]);

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!projectId) {
      setValidationError(t("projectMembersScreen.missingProjectId"));
      return;
    }

    setValidationError(null);
    setRequestError(null);

    const trimmedEmail = targetEmail.trim();
    const trimmedUserId = targetUserId.trim();

    if ((trimmedEmail ? 1 : 0) + (trimmedUserId ? 1 : 0) !== 1) {
      setValidationError(t("projectMembersScreen.validation.singleTarget"));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/invitations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: trimmedEmail || undefined,
          userId: trimmedUserId || undefined,
          role: inviteRole,
        }),
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
        setInvitations((current) => {
          return [...current, data.invitation as ProjectInvitation];
        });
      }
      setTargetEmail("");
      setTargetUserId("");
    } catch {
      setRequestError(t("projectMembersScreen.invitationError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (
    member: ProjectMember,
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

      const data = (await response.json()) as { member?: ProjectMember };
      if (data.member) {
        setMembers((current) => {
          return current.map((item) => {
            return item.userId === member.userId
              ? (data.member as ProjectMember)
              : item;
          });
        });
      }
    } catch {
      setRequestError(t("projectMembersScreen.roleUpdateError"));
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
      setRequestError(t("projectMembersScreen.invitationError"));
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
    <main className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-lg bg-white p-6 shadow-sm">
        {projectId ? (
          <ProjectStoryBreadcrumb
            projectId={projectId}
            currentPageLabel={t("projectMembersScreen.breadcrumb")}
          />
        ) : null}
        <h1 className="mb-6 text-2xl font-bold text-gray-900">
          {t("projectMembersScreen.title")}
        </h1>

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
            <section className="mt-6 rounded-md border border-gray-200 p-4">
              <h2 className="text-base font-semibold text-gray-900">
                {t("projectMembersScreen.invite.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {t("projectMembersScreen.invite.description")}
              </p>

              <form className="mt-4 space-y-3" onSubmit={handleInvite}>
                <div>
                  <label
                    className="block text-sm font-medium text-gray-700"
                    htmlFor="invite-email"
                  >
                    {t("projectMembersScreen.invite.email")}
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
                    htmlFor="invite-user-id"
                  >
                    {t("projectMembersScreen.invite.userId")}
                  </label>
                  <input
                    id="invite-user-id"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    type="text"
                    value={targetUserId}
                    onChange={(event) => {
                      setTargetUserId(event.target.value);
                    }}
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-gray-700"
                    htmlFor="invite-role"
                  >
                    {t("projectMembersScreen.invite.role")}
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
                        {role}
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
                    ? t("projectMembersScreen.invite.inviting")
                    : t("projectMembersScreen.invite.send")}
                </button>
              </form>
              <div className="mt-5 border-t border-gray-200 pt-4">
                <p className="text-sm text-gray-600">
                  {t("projectMembersScreen.invite.linkDescription")}
                </p>
                <button
                  type="button"
                  className="mt-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50"
                  disabled={isCreatingLink || !canManageRoles}
                  onClick={handleCreateLink}
                >
                  {isCreatingLink
                    ? t("projectMembersScreen.invite.creatingLink")
                    : t("projectMembersScreen.invite.createLink")}
                </button>
                {createdLink ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                      aria-label={t("projectMembersScreen.invite.createdLink")}
                      readOnly
                      value={createdLink}
                    />
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                      onClick={() => navigator.clipboard.writeText(createdLink)}
                    >
                      {t("projectMembersScreen.invite.copyLink")}
                    </button>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="mt-6 rounded-md border border-gray-200 p-4">
              <h2 className="text-base font-semibold text-gray-900">
                {t("projectMembersScreen.members.title")}
              </h2>
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
                          {member.userId}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t("projectMembersScreen.members.joined", {
                            date: new Date(member.createdAt).toLocaleString(),
                          })}
                        </p>
                      </div>

                      <select
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
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
                            {role}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-6 rounded-md border border-gray-200 p-4">
              <h2 className="text-base font-semibold text-gray-900">
                {t("projectMembersScreen.invitations.title")}
              </h2>
              {invitations.length === 0 ? (
                <p className="mt-2 text-sm text-gray-600">
                  {t("projectMembersScreen.invitations.empty")}
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {invitations.map((invitation) => (
                    <li
                      key={invitation.id}
                      className="rounded-md border border-gray-100 bg-gray-50 p-3"
                    >
                      <p className="text-sm text-gray-900">
                        {t("projectMembersScreen.invitations.target", {
                          target:
                            invitation.targetUserId ??
                            invitation.targetEmail ??
                            (invitation.invitationType === "single_use"
                              ? t("projectMembersScreen.invitations.singleUse")
                              : "-"),
                        })}
                      </p>
                      <p className="text-xs text-gray-600">
                        {t("projectMembersScreen.invitations.metadata", {
                          role: invitation.role,
                          status: invitation.status,
                        })}
                      </p>
                      <p className="text-xs text-gray-500">
                        {t("projectMembersScreen.invitations.expires", {
                          date: new Date(invitation.expiresAt).toLocaleString(),
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
                          {t("projectMembersScreen.invitations.revoke")}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
