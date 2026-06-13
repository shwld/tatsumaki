import { Hono } from "hono";
import {
  createProject,
  INVALID_PROJECT_NAME_ERROR,
} from "../../application/usecases/create-project";
import {
  deleteProject,
  PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR,
  PROJECT_NOT_FOUND_ERROR,
} from "../../application/usecases/delete-project";
import { listProjects } from "../../application/usecases/list-projects";
import { rebuildIterations } from "../../application/usecases/manage-iterations";
import {
  POINT_SCALE_TYPES,
  getPointScale,
  isValidIterationStartDay,
  isValidPointScaleType,
  isValidSprintDuration,
  isValidTimezone,
} from "../../domain/entities/project";
import {
  PROJECT_MEMBER_ROLES,
  type ProjectInvitation,
  type ProjectInvitationStatus,
  type ProjectMemberRole,
} from "../../domain/entities/project-member";
import { PROJECT_REPOSITORY_ERROR } from "../../domain/repositories/project-repository";
import { D1IterationRepository } from "../../infrastructure/db/repositories/d1-iteration-repository";
import { D1NotificationRepository } from "../../infrastructure/db/repositories/d1-notification-repository";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
import { D1StoryRepository } from "../../infrastructure/db/repositories/d1-story-repository";
import { D1UserRepository } from "../../infrastructure/db/repositories/d1-user-repository";
import { createInvitationNotification } from "../../application/usecases/create-invitation-notifications";
import type { Env } from "../../index";
import { UNKNOWN_MEMBER_DISPLAY_NAME } from "../../lib/member-display-name";
import { requireProjectMembership } from "./project-membership";
import { computeGravatarHash } from "../lib/gravatar";

export const projectsRoute = new Hono<Env>();

const INVITATION_TTL_DAYS = 7;

type InvitationResponse = {
  id: string;
  projectId: string;
  inviterUserId: string;
  targetUserId: string | null;
  targetEmail: string | null;
  role: ProjectMemberRole;
  status: ProjectInvitationStatus;
  expiresAt: string;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const isProjectMemberRole = (value: string): value is ProjectMemberRole => {
  return PROJECT_MEMBER_ROLES.includes(value as ProjectMemberRole);
};

const isEmailAddress = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const normalizeInvitationStatus = (
  invitation: ProjectInvitation,
): ProjectInvitationStatus => {
  if (invitation.status !== "pending") {
    return invitation.status;
  }

  const expiresAt = Date.parse(invitation.expiresAt);
  if (Number.isNaN(expiresAt)) {
    return invitation.status;
  }

  return expiresAt <= Date.now() ? "expired" : invitation.status;
};

const toInvitationResponse = (
  invitation: ProjectInvitation,
): InvitationResponse => {
  return {
    id: invitation.id,
    projectId: invitation.projectId,
    inviterUserId: invitation.inviterUserId,
    targetUserId: invitation.targetUserId,
    targetEmail: invitation.targetEmail,
    role: invitation.role,
    status: normalizeInvitationStatus(invitation),
    expiresAt: invitation.expiresAt,
    acceptedByUserId: invitation.acceptedByUserId,
    acceptedAt: invitation.acceptedAt,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  };
};

projectsRoute.get("/projects", async (c) => {
  const currentUser = c.get("currentUser");
  const repository = new D1ProjectRepository(c.env.DB);
  const projectsResult = await listProjects(repository, currentUser.id);

  if (projectsResult.isErr()) {
    return c.json({ error: "Failed to load projects" }, 500);
  }

  return c.json({ projects: projectsResult.value });
});

projectsRoute.post("/projects", async (c) => {
  let body: { name?: unknown };

  try {
    body = await c.req.json<{ name?: unknown }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (typeof body.name !== "string") {
    return c.json({ error: "Project name is required" }, 400);
  }

  const currentUser = c.get("currentUser");
  const repository = new D1ProjectRepository(c.env.DB);
  const result = await createProject(repository, {
    name: body.name,
    ownerUserId: currentUser.id,
  });

  if (result.isErr()) {
    if (result.error === INVALID_PROJECT_NAME_ERROR) {
      return c.json({ error: "Project name is required" }, 400);
    }

    if (result.error === PROJECT_REPOSITORY_ERROR) {
      return c.json({ error: "Failed to create project" }, 500);
    }

    return c.json({ error: "Unexpected error" }, 500);
  }

  return c.json({ project: result.value }, 201);
});

projectsRoute.get("/projects/:projectId/members", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const [membersResult, invitationsResult] = await Promise.all([
    membership.repository.listMembers(projectId),
    membership.repository.listInvitations(projectId),
  ]);

  if (membersResult.isErr() || invitationsResult.isErr()) {
    return c.json({ error: "Failed to load project members" }, 500);
  }

  const userIds = membersResult.value.map((m) => m.userId);
  const userRepository = new D1UserRepository(c.env.DB);
  const usersResult = await userRepository.findByIds(userIds);
  if (usersResult.isErr()) {
    return c.json({ error: "Failed to load member profiles" }, 500);
  }

  const userMap = new Map(usersResult.value.map((u) => [u.id, u]));

  const membersWithProfile = await Promise.all(
    membersResult.value.map(async (member) => {
      const user = userMap.get(member.userId);
      const gravatarUrl = user
        ? `https://gravatar.com/avatar/${await computeGravatarHash(user.email)}?d=404`
        : null;
      return {
        ...member,
        displayName: user?.displayName ?? UNKNOWN_MEMBER_DISPLAY_NAME,
        avatarUrl: user ? `/api/auth/users/${user.id}/avatar` : null,
        gravatarUrl,
      };
    }),
  );

  return c.json({
    currentMemberRole: membership.member.role,
    members: membersWithProfile,
    invitations: invitationsResult.value.map(toInvitationResponse),
  });
});

projectsRoute.post("/projects/:projectId/invitations", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  if (membership.member.role !== "owner") {
    return c.json(
      {
        error:
          "Only project owners can invite members. Ask an owner to send this invitation.",
      },
      403,
    );
  }

  let body: { email?: unknown; userId?: unknown; role?: unknown };

  try {
    body = await c.req.json<{
      email?: unknown;
      userId?: unknown;
      role?: unknown;
    }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";

  if (!isProjectMemberRole(role)) {
    return c.json({ error: "Role must be owner, member, or viewer" }, 400);
  }

  if ((email ? 1 : 0) + (userId ? 1 : 0) !== 1) {
    return c.json(
      {
        error: "Provide exactly one target: either email or userId",
      },
      400,
    );
  }

  if (email && !isEmailAddress(email)) {
    return c.json({ error: "Email address is invalid" }, 400);
  }

  const duplicateResult =
    await membership.repository.findPendingInvitationByTarget({
      projectId,
      targetUserId: userId || null,
      targetEmail: email || null,
    });

  if (duplicateResult.isErr()) {
    return c.json({ error: "Failed to create invitation" }, 500);
  }

  if (
    duplicateResult.value &&
    normalizeInvitationStatus(duplicateResult.value) === "pending"
  ) {
    return c.json(
      {
        error:
          "An active invitation already exists. Ask the user to accept it or wait for expiration.",
      },
      409,
    );
  }

  const currentUser = c.get("currentUser");
  const expiresAt = new Date(
    Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const invitationResult = await membership.repository.createInvitation({
    projectId,
    inviterUserId: currentUser.id,
    targetUserId: userId || null,
    targetEmail: email || null,
    role,
    expiresAt,
  });

  if (invitationResult.isErr()) {
    return c.json({ error: "Failed to create invitation" }, 500);
  }

  const invitation = invitationResult.value;
  const notificationResult = await createInvitationNotification(
    new D1UserRepository(c.env.DB),
    new D1NotificationRepository(c.env.DB),
    {
      projectId,
      invitationId: invitation.id,
      targetUserId: invitation.targetUserId,
      targetEmail: invitation.targetEmail,
      actorUserId: currentUser.id,
      actorName: currentUser.email ?? "Project Owner",
    },
  );
  if (notificationResult.isErr()) {
    console.error("Failed to create invitation notification", {
      projectId,
      invitationId: invitation.id,
      targetUserId: invitation.targetUserId,
      targetEmail: invitation.targetEmail,
    });
  }

  return c.json({ invitation: toInvitationResponse(invitation) }, 201);
});

projectsRoute.post(
  "/projects/:projectId/invitations/:invitationId/accept",
  async (c) => {
    const projectId = c.req.param("projectId");
    const invitationId = c.req.param("invitationId");
    const currentUser = c.get("currentUser");
    const repository = new D1ProjectRepository(c.env.DB);

    const invitationResult = await repository.findInvitation(
      projectId,
      invitationId,
    );
    if (invitationResult.isErr()) {
      return c.json({ error: "Failed to load invitation" }, 500);
    }

    const invitation = invitationResult.value;
    if (!invitation) {
      return c.json({ error: "Invitation not found" }, 404);
    }

    if (normalizeInvitationStatus(invitation) !== "pending") {
      return c.json(
        {
          error:
            "This invitation is no longer active. Ask a project owner to send a new invitation.",
        },
        410,
      );
    }

    const matchesUserId = invitation.targetUserId
      ? invitation.targetUserId === currentUser.id
      : false;
    const matchesEmail = invitation.targetEmail
      ? (currentUser.email ?? "").toLowerCase() === invitation.targetEmail
      : false;

    if (!matchesUserId && !matchesEmail) {
      return c.json(
        {
          error:
            "This invitation is for another account. Sign in with the invited account or ask for a new invitation.",
        },
        403,
      );
    }

    const memberResult = await repository.upsertMember({
      projectId,
      userId: currentUser.id,
      role: invitation.role,
    });

    if (memberResult.isErr()) {
      return c.json({ error: "Failed to join project" }, 500);
    }

    const acceptedResult = await repository.acceptInvitation(
      invitation.id,
      currentUser.id,
    );
    if (acceptedResult.isErr()) {
      return c.json({ error: "Failed to accept invitation" }, 500);
    }

    return c.json({
      member: memberResult.value,
      invitation: acceptedResult.value
        ? toInvitationResponse(acceptedResult.value)
        : null,
    });
  },
);

projectsRoute.patch("/projects/:projectId/settings", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  if (membership.member.role !== "owner") {
    return c.json(
      {
        error:
          "Only project owners can change settings. Ask a project owner to update settings.",
      },
      403,
    );
  }

  let body: {
    name?: unknown;
    description?: unknown;
    isPublic?: unknown;
    timezone?: unknown;
    estimateBugs?: unknown;
    estimateChores?: unknown;
    sprintDurationDays?: unknown;
    iterationStartDay?: unknown;
  };

  try {
    body = await c.req.json<{
      name?: unknown;
      description?: unknown;
      isPublic?: unknown;
      timezone?: unknown;
      estimateBugs?: unknown;
      estimateChores?: unknown;
      sprintDurationDays?: unknown;
      iterationStartDay?: unknown;
    }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (typeof body.name === "string" && body.name.trim().length === 0) {
    return c.json({ error: "Project name cannot be empty" }, 400);
  }
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const description =
    typeof body.description === "string" ? body.description : undefined;
  const isPublic =
    typeof body.isPublic === "boolean" ? body.isPublic : undefined;
  const timezoneRaw =
    typeof body.timezone === "string" ? body.timezone.trim() : "";
  if (timezoneRaw && !isValidTimezone(timezoneRaw)) {
    return c.json({ error: "Invalid timezone" }, 400);
  }
  const timezone =
    timezoneRaw && isValidTimezone(timezoneRaw) ? timezoneRaw : undefined;
  const estimateBugs =
    typeof body.estimateBugs === "boolean" ? body.estimateBugs : undefined;
  const estimateChores =
    typeof body.estimateChores === "boolean" ? body.estimateChores : undefined;
  const sprintDurationDays =
    typeof body.sprintDurationDays === "number" &&
    isValidSprintDuration(body.sprintDurationDays)
      ? body.sprintDurationDays
      : undefined;
  const iterationStartDay =
    typeof body.iterationStartDay === "number" &&
    isValidIterationStartDay(body.iterationStartDay)
      ? body.iterationStartDay
      : undefined;

  const beforeProjectResult = await membership.repository.findById(projectId);
  if (beforeProjectResult.isErr()) {
    return c.json({ error: "Failed to load project" }, 500);
  }
  if (!beforeProjectResult.value) {
    return c.json({ error: "Project not found" }, 404);
  }
  const beforeProject = beforeProjectResult.value;

  if (
    name === undefined &&
    description === undefined &&
    isPublic === undefined &&
    timezone === undefined &&
    estimateBugs === undefined &&
    estimateChores === undefined &&
    sprintDurationDays === undefined &&
    iterationStartDay === undefined
  ) {
    return c.json(
      {
        error: "At least one setting must be provided",
      },
      400,
    );
  }

  const updatedResult = await membership.repository.updateSettings({
    projectId,
    name,
    description,
    isPublic,
    timezone,
    estimateBugs,
    estimateChores,
    sprintDurationDays,
    iterationStartDay,
  });

  if (updatedResult.isErr()) {
    return c.json({ error: "Failed to update project settings" }, 500);
  }

  if (!updatedResult.value) {
    return c.json({ error: "Project not found" }, 404);
  }

  const updatedProject = updatedResult.value;
  const calendarChanged =
    (sprintDurationDays !== undefined &&
      sprintDurationDays !== beforeProject.sprintDurationDays) ||
    (iterationStartDay !== undefined &&
      iterationStartDay !== beforeProject.iterationStartDay);

  if (calendarChanged) {
    const iterationRepository = new D1IterationRepository(c.env.DB);
    const storyRepository = new D1StoryRepository(c.env.DB);
    const rebuildResult = await rebuildIterations(
      iterationRepository,
      storyRepository,
      {
        projectId,
        iterationStartDay: updatedProject.iterationStartDay,
        sprintDurationDays: updatedProject.sprintDurationDays,
        today: new Date().toISOString().slice(0, 10),
      },
    );
    if (rebuildResult.isErr()) {
      return c.json({ error: "Failed to rebuild iterations" }, 500);
    }
  }

  return c.json({
    project: {
      ...updatedProject,
      currentUserRole: membership.member.role,
    },
  });
});

projectsRoute.delete("/projects/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    if (membership.response.status === 403) {
      return c.json(
        { error: "Project not found", code: "project_not_found" },
        404,
      );
    }
    return membership.response;
  }

  if (membership.member.role !== "owner") {
    return c.json(
      {
        error:
          "Only project owners can delete this project. Ask a project owner to delete it.",
      },
      403,
    );
  }

  let body: { confirmProjectName?: unknown };
  try {
    body = await c.req.json<{ confirmProjectName?: unknown }>();
  } catch {
    return c.json(
      { error: "Invalid JSON body", code: "invalid_json_body" },
      400,
    );
  }

  if (typeof body.confirmProjectName !== "string") {
    return c.json(
      {
        error: "confirmProjectName is required",
        code: "confirm_project_name_required",
      },
      400,
    );
  }

  const result = await deleteProject(membership.repository, {
    projectId,
    confirmProjectName: body.confirmProjectName,
  });
  if (result.isErr()) {
    if (result.error === PROJECT_NAME_CONFIRMATION_MISMATCH_ERROR) {
      return c.json(
        {
          error: "Project name does not match",
          code: "project_name_mismatch",
        },
        400,
      );
    }
    if (result.error === PROJECT_NOT_FOUND_ERROR) {
      return c.json(
        { error: "Project not found", code: "project_not_found" },
        404,
      );
    }
    return c.json(
      { error: "Failed to delete project", code: "project_delete_failed" },
      500,
    );
  }

  return c.json({ ok: true });
});

projectsRoute.patch("/projects/:projectId/members/:memberUserId", async (c) => {
  const projectId = c.req.param("projectId");
  const memberUserId = c.req.param("memberUserId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  if (membership.member.role !== "owner") {
    return c.json(
      {
        error:
          "Only project owners can change roles. Ask a project owner to update this member.",
      },
      403,
    );
  }

  let body: { role?: unknown };

  try {
    body = await c.req.json<{ role?: unknown }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!isProjectMemberRole(role)) {
    return c.json({ error: "Role must be owner, member, or viewer" }, 400);
  }

  const updatedResult = await membership.repository.updateMemberRole({
    projectId,
    userId: memberUserId,
    role,
  });

  if (updatedResult.isErr()) {
    return c.json({ error: "Failed to update member role" }, 500);
  }

  if (!updatedResult.value) {
    return c.json({ error: "Member not found" }, 404);
  }

  return c.json({ member: updatedResult.value });
});

projectsRoute.get("/projects/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const projectResult = await membership.repository.findById(projectId);
  if (projectResult.isErr()) {
    return c.json({ error: "Failed to load project" }, 500);
  }
  if (!projectResult.value) {
    return c.json({ error: "Project not found" }, 404);
  }

  const project = projectResult.value;
  return c.json({
    project: {
      ...project,
      currentUserRole: membership.member.role,
      pointScale: getPointScale(
        project.pointScaleType,
        project.customPointScale,
      ),
    },
  });
});

projectsRoute.patch("/projects/:projectId/point-scale", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  if (membership.member.role !== "owner") {
    return c.json(
      {
        error:
          "Only project owners can change the point scale. Ask a project owner to update this setting.",
      },
      403,
    );
  }

  let body: { pointScaleType?: unknown; customPointScale?: unknown };

  try {
    body = await c.req.json<{
      pointScaleType?: unknown;
      customPointScale?: unknown;
    }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const pointScaleType =
    typeof body.pointScaleType === "string" ? body.pointScaleType : "";

  if (!isValidPointScaleType(pointScaleType)) {
    return c.json(
      {
        error: `Point scale type must be one of: ${POINT_SCALE_TYPES.join(", ")}`,
      },
      400,
    );
  }

  let customPointScale: number[] | null = null;
  if (pointScaleType === "custom") {
    if (
      !Array.isArray(body.customPointScale) ||
      body.customPointScale.length === 0 ||
      !body.customPointScale.every(
        (v) => typeof v === "number" && Number.isInteger(v) && v >= 0,
      )
    ) {
      return c.json(
        {
          error:
            "Custom point scale must be a non-empty array of non-negative integers",
        },
        400,
      );
    }
    customPointScale = [...new Set(body.customPointScale as number[])].sort(
      (a, b) => a - b,
    );
  }

  const updatedResult = await membership.repository.updatePointScale({
    projectId,
    pointScaleType,
    customPointScale,
  });

  if (updatedResult.isErr()) {
    return c.json({ error: "Failed to update point scale" }, 500);
  }

  if (!updatedResult.value) {
    return c.json({ error: "Project not found" }, 404);
  }

  const project = updatedResult.value;
  return c.json({
    project: {
      ...project,
      currentUserRole: membership.member.role,
      pointScale: getPointScale(
        project.pointScaleType,
        project.customPointScale,
      ),
    },
  });
});
