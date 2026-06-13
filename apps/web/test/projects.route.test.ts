import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthHeaders, setupAccessBindings } from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";

describe("project routes", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
  });

  it("creates a project with default sprint duration and owner role", async () => {
    const response = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await createAuthHeaders()),
      },
      body: JSON.stringify({ name: "Alpha Project" }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      project: {
        __typename: "Project",
        id: expect.any(String),
        name: "Alpha Project",
        description: "",
        isPublic: false,
        timezone: "Asia/Tokyo",
        sprintDurationDays: 14,
        pointScaleType: "fibonacci",
        customPointScale: null,
        estimateBugs: true,
        estimateChores: true,
        iterationStartDay: 1,
        currentUserRole: "owner",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
  });

  it("lists projects only for current member", async () => {
    const createResponse = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await createAuthHeaders()),
      },
      body: JSON.stringify({ name: "Alpha Project" }),
    });

    expect(createResponse.status).toBe(201);

    const ownerListResponse = await SELF.fetch(
      "http://localhost/api/projects",
      {
        headers: await createAuthHeaders(),
      },
    );

    expect(ownerListResponse.status).toBe(200);
    expect(await ownerListResponse.json()).toEqual({
      projects: [
        {
          __typename: "Project",
          id: expect.any(String),
          name: "Alpha Project",
          description: "",
          isPublic: false,
          timezone: "Asia/Tokyo",
          sprintDurationDays: 14,
          pointScaleType: "fibonacci",
          customPointScale: null,
          estimateBugs: true,
          estimateChores: true,
          iterationStartDay: 1,
          currentUserRole: "owner",
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      ],
    });

    const otherUserResponse = await SELF.fetch(
      "http://localhost/api/projects",
      {
        headers: await createAuthHeaders({
          sub: "github|another-user",
          email: "another@example.com",
        }),
      },
    );

    expect(otherUserResponse.status).toBe(200);
    expect(await otherUserResponse.json()).toEqual({ projects: [] });
  });

  it("invites by email and by user ID", async () => {
    const createResponse = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await createAuthHeaders()),
      },
      body: JSON.stringify({ name: "Alpha Project" }),
    });
    const { project } = (await createResponse.json()) as {
      project: { id: string };
    };

    const inviteByEmail = await SELF.fetch(
      `http://localhost/api/projects/${project.id}/invitations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({
          email: "new-user@example.com",
          role: "viewer",
        }),
      },
    );

    expect(inviteByEmail.status).toBe(201);
    expect(await inviteByEmail.json()).toEqual({
      invitation: {
        id: expect.any(String),
        projectId: project.id,
        inviterUserId: "github|test-user",
        targetUserId: null,
        targetEmail: "new-user@example.com",
        role: "viewer",
        status: "pending",
        expiresAt: expect.any(String),
        acceptedByUserId: null,
        acceptedAt: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });

    const inviteByUserId = await SELF.fetch(
      `http://localhost/api/projects/${project.id}/invitations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({
          userId: "github|invited-by-id",
          role: "member",
        }),
      },
    );

    expect(inviteByUserId.status).toBe(201);
    const inviteByUserIdBody = (await inviteByUserId.json()) as {
      invitation: { id: string };
    };
    expect(inviteByUserIdBody).toEqual({
      invitation: {
        id: expect.any(String),
        projectId: project.id,
        inviterUserId: "github|test-user",
        targetUserId: "github|invited-by-id",
        targetEmail: null,
        role: "member",
        status: "pending",
        expiresAt: expect.any(String),
        acceptedByUserId: null,
        acceptedAt: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });

    const notification = (await (env.DB as any)
      .prepare(
        "SELECT kind, invitation_id, recipient_user_id, source_type, source_id FROM notifications WHERE invitation_id = ?",
      )
      .bind(inviteByUserIdBody.invitation.id)
      .first()) as {
      kind: string;
      invitation_id: string | null;
      recipient_user_id: string;
      source_type: string;
      source_id: string;
    } | null;

    expect(notification).toEqual({
      kind: "member_invitation",
      invitation_id: inviteByUserIdBody.invitation.id,
      recipient_user_id: "github|invited-by-id",
      source_type: "invitation",
      source_id: inviteByUserIdBody.invitation.id,
    });
  });

  it("accepts invitation and invited member can access project", async () => {
    const createResponse = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await createAuthHeaders()),
      },
      body: JSON.stringify({ name: "Alpha Project" }),
    });
    const { project } = (await createResponse.json()) as {
      project: { id: string };
    };

    const inviteResponse = await SELF.fetch(
      `http://localhost/api/projects/${project.id}/invitations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({
          userId: "github|invited-user",
          role: "viewer",
        }),
      },
    );

    const { invitation } = (await inviteResponse.json()) as {
      invitation: { id: string };
    };

    const acceptResponse = await SELF.fetch(
      `http://localhost/api/projects/${project.id}/invitations/${invitation.id}/accept`,
      {
        method: "POST",
        headers: await createAuthHeaders({
          sub: "github|invited-user",
          email: "invited@example.com",
        }),
      },
    );

    expect(acceptResponse.status).toBe(200);
    expect(await acceptResponse.json()).toEqual({
      member: {
        __typename: "ProjectMember",
        projectId: project.id,
        userId: "github|invited-user",
        role: "viewer",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
      invitation: {
        id: invitation.id,
        projectId: project.id,
        inviterUserId: "github|test-user",
        targetUserId: "github|invited-user",
        targetEmail: null,
        role: "viewer",
        status: "accepted",
        expiresAt: expect.any(String),
        acceptedByUserId: "github|invited-user",
        acceptedAt: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });

    const listResponse = await SELF.fetch("http://localhost/api/projects", {
      headers: await createAuthHeaders({
        sub: "github|invited-user",
        email: "invited@example.com",
      }),
    });

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      projects: [
        {
          __typename: "Project",
          id: project.id,
          name: "Alpha Project",
          description: "",
          isPublic: false,
          timezone: "Asia/Tokyo",
          sprintDurationDays: 14,
          pointScaleType: "fibonacci",
          customPointScale: null,
          estimateBugs: true,
          estimateChores: true,
          iterationStartDay: 1,
          currentUserRole: "viewer",
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      ],
    });
  });

  it("updates member role by owner", async () => {
    const createResponse = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await createAuthHeaders()),
      },
      body: JSON.stringify({ name: "Alpha Project" }),
    });
    const { project } = (await createResponse.json()) as {
      project: { id: string };
    };

    const inviteResponse = await SELF.fetch(
      `http://localhost/api/projects/${project.id}/invitations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({
          userId: "github|role-target",
          role: "viewer",
        }),
      },
    );

    const { invitation } = (await inviteResponse.json()) as {
      invitation: { id: string };
    };

    await SELF.fetch(
      `http://localhost/api/projects/${project.id}/invitations/${invitation.id}/accept`,
      {
        method: "POST",
        headers: await createAuthHeaders({
          sub: "github|role-target",
          email: "role-target@example.com",
        }),
      },
    );

    const updateRoleResponse = await SELF.fetch(
      `http://localhost/api/projects/${project.id}/members/github|role-target`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({ role: "member" }),
      },
    );

    expect(updateRoleResponse.status).toBe(200);
    expect(await updateRoleResponse.json()).toEqual({
      member: {
        __typename: "ProjectMember",
        projectId: project.id,
        userId: "github|role-target",
        role: "member",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
  });

  it("returns duplicate invitation guidance", async () => {
    const createResponse = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await createAuthHeaders()),
      },
      body: JSON.stringify({ name: "Alpha Project" }),
    });
    const { project } = (await createResponse.json()) as {
      project: { id: string };
    };

    await SELF.fetch(
      `http://localhost/api/projects/${project.id}/invitations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({ email: "dup@example.com", role: "member" }),
      },
    );

    const duplicateResponse = await SELF.fetch(
      `http://localhost/api/projects/${project.id}/invitations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({ email: "dup@example.com", role: "member" }),
      },
    );

    expect(duplicateResponse.status).toBe(409);
    expect(await duplicateResponse.json()).toEqual({
      error:
        "An active invitation already exists. Ask the user to accept it or wait for expiration.",
    });
  });

  it("returns 410 when accepting an expired invitation", async () => {
    const createResponse = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await createAuthHeaders()),
      },
      body: JSON.stringify({ name: "Alpha Project" }),
    });
    const { project } = (await createResponse.json()) as {
      project: { id: string };
    };

    const inviteResponse = await SELF.fetch(
      `http://localhost/api/projects/${project.id}/invitations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({
          userId: "github|expired-user",
          role: "viewer",
        }),
      },
    );
    const { invitation } = (await inviteResponse.json()) as {
      invitation: { id: string };
    };

    const baseNow = Date.now();
    const dateNowSpy = vi.spyOn(Date, "now");
    dateNowSpy.mockReturnValue(baseNow + 8 * 24 * 60 * 60 * 1000);

    try {
      const acceptResponse = await SELF.fetch(
        `http://localhost/api/projects/${project.id}/invitations/${invitation.id}/accept`,
        {
          method: "POST",
          headers: await createAuthHeaders({
            sub: "github|expired-user",
            email: "expired@example.com",
          }),
        },
      );

      expect(acceptResponse.status).toBe(410);
      expect(await acceptResponse.json()).toEqual({
        error:
          "This invitation is no longer active. Ask a project owner to send a new invitation.",
      });
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("returns 403 when non-owner tries to invite", async () => {
    const createResponse = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await createAuthHeaders()),
      },
      body: JSON.stringify({ name: "Alpha Project" }),
    });
    const { project } = (await createResponse.json()) as {
      project: { id: string };
    };

    const inviteResponse = await SELF.fetch(
      `http://localhost/api/projects/${project.id}/invitations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({
          userId: "github|viewer-user",
          role: "viewer",
        }),
      },
    );

    const { invitation } = (await inviteResponse.json()) as {
      invitation: { id: string };
    };

    await SELF.fetch(
      `http://localhost/api/projects/${project.id}/invitations/${invitation.id}/accept`,
      {
        method: "POST",
        headers: await createAuthHeaders({
          sub: "github|viewer-user",
          email: "viewer@example.com",
        }),
      },
    );

    const nonOwnerInviteResponse = await SELF.fetch(
      `http://localhost/api/projects/${project.id}/invitations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders({
            sub: "github|viewer-user",
            email: "viewer@example.com",
          })),
        },
        body: JSON.stringify({ email: "blocked@example.com", role: "viewer" }),
      },
    );

    expect(nonOwnerInviteResponse.status).toBe(403);
    expect(await nonOwnerInviteResponse.json()).toEqual({
      error:
        "Only project owners can invite members. Ask an owner to send this invitation.",
    });
  });

  it("lists invitation notifications for invited user without project membership", async () => {
    const createResponse = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await createAuthHeaders()),
      },
      body: JSON.stringify({ name: "Invite Notification Project" }),
    });
    const { project } = (await createResponse.json()) as {
      project: { id: string };
    };

    const invitedHeaders = await createAuthHeaders({
      sub: "github|invited-target",
      email: "invited-target@example.com",
    });
    await SELF.fetch("http://localhost/api/auth/me", {
      headers: invitedHeaders,
    });

    const inviteResponse = await SELF.fetch(
      `http://localhost/api/projects/${project.id}/invitations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({
          userId: "github|invited-target",
          role: "member",
        }),
      },
    );
    expect(inviteResponse.status).toBe(201);

    const notificationsResponse = await SELF.fetch(
      "http://localhost/api/auth/me/notifications?limit=20",
      {
        headers: invitedHeaders,
      },
    );
    expect(notificationsResponse.status).toBe(200);
    const notificationsJson = (await notificationsResponse.json()) as {
      notifications: Array<{
        projectId: string;
        kind: string;
        invitationId: string | null;
      }>;
    };
    expect(notificationsJson.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId: project.id,
          kind: "member_invitation",
          invitationId: expect.any(String),
        }),
      ]),
    );
  });

  it("returns 400 when project name is blank", async () => {
    const response = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await createAuthHeaders()),
      },
      body: JSON.stringify({ name: "   " }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Project name is required",
    });
  });

  it("returns 400 when project name is missing", async () => {
    const response = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await createAuthHeaders()),
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Project name is required",
    });
  });

  it("returns 400 when body is invalid JSON", async () => {
    const response = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await createAuthHeaders()),
      },
      body: "{invalid-json}",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });

  describe("delete project", () => {
    async function createProjectAsOwner(name = "Delete Target") {
      const response = await SELF.fetch("http://localhost/api/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({ name }),
      });
      const { project } = (await response.json()) as {
        project: { id: string; name: string };
      };
      return project;
    }

    it("deletes project for owner with matching confirmProjectName", async () => {
      const project = await createProjectAsOwner();
      await SELF.fetch(`http://localhost/api/projects/${project.id}/stories`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({ title: "story for delete" }),
      });

      await (env.DB as any)
        .prepare(
          "INSERT INTO story_timeline_entries (id, project_id, story_id, entry_type, actor_user_id, actor_name, action, field_name, old_value, new_value, body, created_at, updated_at) VALUES (?, ?, NULL, 'activity', ?, ?, 'updated', 'title', 'a', 'b', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        )
        .bind("timeline-delete-1", project.id, "github|test-user", "Test User")
        .run();

      const response = await SELF.fetch(
        `http://localhost/api/projects/${project.id}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            ...(await createAuthHeaders()),
          },
          body: JSON.stringify({ confirmProjectName: "Delete Target" }),
        },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });

      const listResponse = await SELF.fetch("http://localhost/api/projects", {
        headers: await createAuthHeaders(),
      });
      const listBody = (await listResponse.json()) as { projects: unknown[] };
      expect(listBody.projects).toHaveLength(0);

      const timelineRow = await (env.DB as any)
        .prepare(
          "SELECT id FROM story_timeline_entries WHERE id = 'timeline-delete-1'",
        )
        .first();
      expect(timelineRow).toBeNull();
    });

    it("returns 400 when confirmProjectName does not match", async () => {
      const project = await createProjectAsOwner();
      const response = await SELF.fetch(
        `http://localhost/api/projects/${project.id}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            ...(await createAuthHeaders()),
          },
          body: JSON.stringify({ confirmProjectName: "Wrong Name" }),
        },
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Project name does not match",
        code: "project_name_mismatch",
      });
    });

    it("returns 403 for non-owner", async () => {
      const project = await createProjectAsOwner();

      await SELF.fetch(
        `http://localhost/api/projects/${project.id}/invitations`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(await createAuthHeaders()),
          },
          body: JSON.stringify({
            userId: "github|member-user",
            role: "member",
          }),
        },
      );

      const acceptMemberInvite = await (env.DB as any)
        .prepare(
          "SELECT id FROM project_invitations WHERE project_id = ? AND target_user_id = ?",
        )
        .bind(project.id, "github|member-user")
        .first();
      expect(acceptMemberInvite).toBeTruthy();
      await SELF.fetch(
        `http://localhost/api/projects/${project.id}/invitations/${(acceptMemberInvite as { id: string }).id}/accept`,
        {
          method: "POST",
          headers: await createAuthHeaders({
            sub: "github|member-user",
            email: "member@example.com",
          }),
        },
      );

      const response = await SELF.fetch(
        `http://localhost/api/projects/${project.id}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            ...(await createAuthHeaders({
              sub: "github|member-user",
              email: "member@example.com",
            })),
          },
          body: JSON.stringify({ confirmProjectName: "Delete Target" }),
        },
      );

      expect(response.status).toBe(403);
    });

    it("returns 404 for already deleted project", async () => {
      const project = await createProjectAsOwner();
      const authHeaders = await createAuthHeaders();

      const first = await SELF.fetch(
        `http://localhost/api/projects/${project.id}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify({ confirmProjectName: "Delete Target" }),
        },
      );
      expect(first.status).toBe(200);

      const second = await SELF.fetch(
        `http://localhost/api/projects/${project.id}`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify({ confirmProjectName: "Delete Target" }),
        },
      );
      expect(second.status).toBe(404);
      expect(await second.json()).toEqual({
        error: "Project not found",
        code: "project_not_found",
      });
    });
  });

  describe("iteration settings", () => {
    async function createProjectAsOwner() {
      const response = await SELF.fetch("http://localhost/api/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await createAuthHeaders()),
        },
        body: JSON.stringify({ name: "Iteration Project" }),
      });
      const { project } = (await response.json()) as {
        project: { id: string };
      };
      return project;
    }

    it("updates sprint duration days", async () => {
      const project = await createProjectAsOwner();

      const response = await SELF.fetch(
        `http://localhost/api/projects/${project.id}/settings`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            ...(await createAuthHeaders()),
          },
          body: JSON.stringify({ sprintDurationDays: 7 }),
        },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        project: { sprintDurationDays: number };
      };
      expect(data.project.sprintDurationDays).toBe(7);
    });

    it("updates iteration start day", async () => {
      const project = await createProjectAsOwner();

      const response = await SELF.fetch(
        `http://localhost/api/projects/${project.id}/settings`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            ...(await createAuthHeaders()),
          },
          body: JSON.stringify({ iterationStartDay: 3 }),
        },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        project: { iterationStartDay: number };
      };
      expect(data.project.iterationStartDay).toBe(3);
    });

    it("updates both sprint duration and start day together", async () => {
      const project = await createProjectAsOwner();

      const response = await SELF.fetch(
        `http://localhost/api/projects/${project.id}/settings`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            ...(await createAuthHeaders()),
          },
          body: JSON.stringify({
            sprintDurationDays: 21,
            iterationStartDay: 0,
          }),
        },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        project: { sprintDurationDays: number; iterationStartDay: number };
      };
      expect(data.project.sprintDurationDays).toBe(21);
      expect(data.project.iterationStartDay).toBe(0);
    });

    it("rejects invalid sprint duration", async () => {
      const project = await createProjectAsOwner();

      const response = await SELF.fetch(
        `http://localhost/api/projects/${project.id}/settings`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            ...(await createAuthHeaders()),
          },
          body: JSON.stringify({ sprintDurationDays: 10 }),
        },
      );

      expect(response.status).toBe(400);
    });

    it("rejects invalid iteration start day", async () => {
      const project = await createProjectAsOwner();

      const response = await SELF.fetch(
        `http://localhost/api/projects/${project.id}/settings`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            ...(await createAuthHeaders()),
          },
          body: JSON.stringify({ iterationStartDay: 7 }),
        },
      );

      expect(response.status).toBe(400);
    });

    it("rebuilds iterations so each sprint matches the new duration", async () => {
      const project = await createProjectAsOwner();
      const authHeaders = await createAuthHeaders();

      const patchResponse = await SELF.fetch(
        `http://localhost/api/projects/${project.id}/settings`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify({ sprintDurationDays: 7 }),
        },
      );
      expect(patchResponse.status).toBe(200);

      const iterationsResponse = await SELF.fetch(
        `http://localhost/api/projects/${project.id}/iterations`,
        { headers: authHeaders },
      );
      expect(iterationsResponse.status).toBe(200);
      const body = (await iterationsResponse.json()) as {
        iterations: Array<{ startDate: string; endDate: string }>;
      };
      expect(body.iterations.length).toBeGreaterThan(0);
      for (const it of body.iterations) {
        const start = new Date(`${it.startDate}T00:00:00`);
        const end = new Date(`${it.endDate}T00:00:00`);
        expect((end.getTime() - start.getTime()) / 86400000).toBe(7);
      }
    });
  });
});
