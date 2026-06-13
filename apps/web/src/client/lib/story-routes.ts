export function projectStoriesPath(projectId: string): string {
  return `/projects/${projectId}/stories`;
}

export function projectVelocityDashboardPath(projectId: string): string {
  return `/projects/${projectId}/velocity`;
}

export function projectStoryEditPath(
  projectId: string,
  storyNumber: string,
): string {
  return `/projects/${projectId}/stories/${encodeURIComponent(storyNumber)}/edit`;
}

export function projectStoryDetailPath(
  projectId: string,
  storyNumber: string,
): string {
  return `/projects/${projectId}/stories/${encodeURIComponent(storyNumber)}`;
}

export function projectStoryHashPath(
  projectId: string,
  storyNumber: string | number,
): string {
  return `${projectStoriesPath(projectId)}#${String(storyNumber)}`;
}

export function parseStoryNumberFromHash(hash: string): string | null {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  return parseStoryNumber(normalized);
}

export function parseStoryNumber(value: string): string | null {
  const storyNumber = value.trim();
  if (!/^\d+$/.test(storyNumber)) {
    return null;
  }
  return storyNumber;
}

export type ProjectStoriesApiQuery = {
  detail?: "full" | "summary";
  limit?: number;
  order?:
    | "positionAsc"
    | "statusChangedAtAsc"
    | "statusChangedAtDesc"
    | "currentAcceptedFirst";
  q?: string;
};

export function projectStoriesApiPath(
  projectId: string,
  query?: ProjectStoriesApiQuery,
): string {
  const base = `/api/projects/${projectId}/stories`;
  if (!query) {
    return base;
  }
  const params = new URLSearchParams();
  if (query.detail !== undefined) {
    params.set("detail", query.detail);
  }
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  if (query.order !== undefined) {
    params.set("order", query.order);
  }
  if (query.q !== undefined && query.q.trim() !== "") {
    params.set("q", query.q.trim());
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function projectPlanningPokerSessionsApiPath(projectId: string): string {
  return `/api/projects/${projectId}/planning-poker/sessions`;
}

export function projectPlanningPokerActiveSessionApiPath(
  projectId: string,
): string {
  return `${projectPlanningPokerSessionsApiPath(projectId)}/active`;
}

export function projectPlanningPokerSessionApiPath(
  projectId: string,
  sessionId: string,
): string {
  return `${projectPlanningPokerSessionsApiPath(projectId)}/${sessionId}`;
}

export function projectPlanningPokerVotesApiPath(
  projectId: string,
  sessionId: string,
): string {
  return `${projectPlanningPokerSessionApiPath(projectId, sessionId)}/votes`;
}

export function projectPlanningPokerRevealApiPath(
  projectId: string,
  sessionId: string,
): string {
  return `${projectPlanningPokerSessionApiPath(projectId, sessionId)}/reveal`;
}

export function projectPlanningPokerApplyApiPath(
  projectId: string,
  sessionId: string,
): string {
  return `${projectPlanningPokerSessionApiPath(projectId, sessionId)}/apply`;
}

export function projectPlanningPokerCloseApiPath(
  projectId: string,
  sessionId: string,
): string {
  return `${projectPlanningPokerSessionApiPath(projectId, sessionId)}/close`;
}

export function projectPlanningPokerResetApiPath(
  projectId: string,
  sessionId: string,
): string {
  return `${projectPlanningPokerSessionApiPath(projectId, sessionId)}/reset`;
}

export function projectStoryPriorityHistoryApiPath(projectId: string): string {
  return `/api/projects/${projectId}/stories/priority-history`;
}

export function projectBulkStoryStatusApiPath(projectId: string): string {
  return `/api/projects/${projectId}/stories/bulk-status`;
}

export function projectBulkStoryLabelsApiPath(projectId: string): string {
  return `/api/projects/${projectId}/stories/bulk-labels`;
}

export function projectStoryTimelineApiPath(
  projectId: string,
  storyNumber: string,
  options?: { limit?: number; before?: string },
): string {
  const encodedStoryId = encodeURIComponent(storyNumber);
  const basePath = `/api/projects/${projectId}/stories/${encodedStoryId}/timeline`;
  if (
    options?.limit === undefined &&
    (options?.before === undefined || options.before === "")
  ) {
    return basePath;
  }
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.before !== undefined && options.before !== "") {
    params.set("before", options.before);
  }
  const query = params.toString();
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}

export function projectStoryBlockersApiPath(
  projectId: string,
  storyNumber: string,
): string {
  return `/api/projects/${projectId}/stories/${encodeURIComponent(storyNumber)}/blockers`;
}

export function projectStoryCommentsApiPath(
  projectId: string,
  storyNumber: string,
): string {
  return `/api/projects/${projectId}/stories/${encodeURIComponent(storyNumber)}/comments`;
}

export function projectStoryAttachmentsApiPath(
  projectId: string,
  storyNumber: string,
): string {
  return `/api/projects/${projectId}/stories/${encodeURIComponent(storyNumber)}/attachments`;
}

export function projectStoryAttachmentContentApiPath(
  projectId: string,
  storyNumber: string,
  attachmentId: string,
): string {
  return `${projectStoryAttachmentsApiPath(projectId, storyNumber)}/${attachmentId}/content`;
}

export function projectStoryCommentApiPath(
  projectId: string,
  storyNumber: string,
  commentId: string,
): string {
  return `/api/projects/${projectId}/stories/${encodeURIComponent(storyNumber)}/comments/${commentId}`;
}

export function projectIterationsApiPath(projectId: string): string {
  return `/api/projects/${projectId}/iterations`;
}

export function projectIterationBurndownApiPath(
  projectId: string,
  iterationId: string,
): string {
  return `/api/projects/${projectId}/iterations/${iterationId}/burndown`;
}

export function projectIterationStoriesApiPath(
  projectId: string,
  iterationId: string,
): string {
  return `/api/projects/${projectId}/iterations/${iterationId}/stories`;
}

export function projectIterationStoryApiPath(
  projectId: string,
  iterationId: string,
  storyNumber: string,
): string {
  return `/api/projects/${projectId}/iterations/${iterationId}/stories/${storyNumber}`;
}

export function projectLabelsApiPath(projectId: string): string {
  return `/api/projects/${projectId}/labels`;
}

export function projectApiPath(projectId: string): string {
  return `/api/projects/${projectId}`;
}

export function projectPointScaleApiPath(projectId: string): string {
  return `/api/projects/${projectId}/point-scale`;
}

export function projectMembersPath(projectId: string): string {
  return `/projects/${projectId}/members`;
}

export function projectApiKeysPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/api-keys`;
}

export function projectApiKeysApiPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/api-keys`;
}

export function projectSettingsApiPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/settings`;
}

export function projectDeleteApiPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}`;
}

export function projectSettingsPath(projectId: string): string {
  return `/projects/${projectId}/settings`;
}

export function projectHistoryPath(projectId: string): string {
  return `/projects/${projectId}/history`;
}

export function projectHistoryApiPath(
  projectId: string,
  options?: { limit?: number; before?: string },
): string {
  const base = `/api/projects/${projectId}/history`;
  if (!options) {
    return base;
  }
  const params = new URLSearchParams();
  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options.before) {
    params.set("before", options.before);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function myNotificationsApiPath(options?: {
  projectId?: string;
  limit?: number;
}): string {
  const params = new URLSearchParams({
    limit: String(options?.limit ?? 50),
  });
  if (options?.projectId) {
    params.set("projectId", options.projectId);
  }
  return `/api/auth/me/notifications?${params.toString()}`;
}

export function myNotificationsReadApiPath(): string {
  return "/api/auth/me/notifications/read";
}

export function projectInvitationAcceptPath(
  projectId: string,
  invitationId: string,
): string {
  return `/projects/${projectId}/invitations/${invitationId}/accept`;
}

export function projectInvitationAcceptApiPath(
  projectId: string,
  invitationId: string,
): string {
  return `/api/projects/${projectId}/invitations/${invitationId}/accept`;
}

export function projectSavedFiltersApiPath(projectId: string): string {
  return `/api/projects/${projectId}/saved-filters`;
}

export function projectSavedFilterApiPath(
  projectId: string,
  filterId: string,
): string {
  return `/api/projects/${projectId}/saved-filters/${filterId}`;
}

export function projectPlanningPokerSessionWsApiPath(
  projectId: string,
  sessionId: string,
): string {
  return `${projectPlanningPokerSessionApiPath(projectId, sessionId)}/ws`;
}
