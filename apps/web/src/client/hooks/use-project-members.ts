import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuthError } from "../contexts/auth-error-context";
import { isAuthError, isForbiddenError } from "../lib/api-error";
import { parseErrorMessage } from "../lib/parse-error-message";
import type {
  ProjectInvitation,
  ProjectMember,
  ProjectMemberEntry,
  ProjectMemberRole,
} from "../types/project";

type ProjectMembersResponse = {
  currentMemberRole?: ProjectMemberRole;
  members?: Array<
    ProjectMember & Partial<Omit<ProjectMemberEntry, keyof ProjectMember>>
  >;
  invitations?: ProjectInvitation[];
};

export const MEMBER_ROLES: ProjectMemberRole[] = ["owner", "member", "viewer"];

export function useProjectMembers(projectId: string | undefined) {
  const { t } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const [members, setMembers] = useState<ProjectMemberEntry[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [currentMemberRole, setCurrentMemberRole] =
    useState<ProjectMemberRole | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          setMembers(
            Array.isArray(data.members)
              ? data.members.map((member) => ({
                  ...member,
                  displayName: member.displayName ?? null,
                  avatarUrl: member.avatarUrl ?? null,
                  gravatarUrl: member.gravatarUrl ?? null,
                }))
              : [],
          );
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

  const canManageRoles = useMemo(
    () => currentMemberRole === "owner",
    [currentMemberRole],
  );

  return {
    members,
    setMembers,
    invitations,
    setInvitations,
    forbidden,
    currentMemberRole,
    canManageRoles,
    requestError,
    setRequestError,
    isLoading,
    notifySessionExpired,
  };
}
