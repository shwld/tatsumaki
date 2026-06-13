import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createAccessJwt,
  createAuthHeaders,
  setupAccessBindings,
} from "./helpers/access-jwt";
import { resetDatabase } from "./helpers/db";

describe("access auth", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
    await setupAccessBindings(env);
  });

  it("returns 401 for protected API when unauthenticated", async () => {
    const response = await SELF.fetch("http://localhost/api/projects");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when audience does not match", async () => {
    const response = await SELF.fetch("http://localhost/api/projects", {
      headers: await createAuthHeaders({ aud: ["other-audience"] }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when token signature is invalid", async () => {
    const validToken = await createAccessJwt();
    const [header, payload, signature] = validToken.split(".");
    const tamperedPayload = payload.endsWith("A")
      ? `${payload.slice(0, -1)}B`
      : `${payload.slice(0, -1)}A`;
    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

    const response = await SELF.fetch("http://localhost/api/projects", {
      headers: {
        "Cf-Access-Jwt-Assertion": tamperedToken,
      },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when token is expired", async () => {
    const response = await SELF.fetch("http://localhost/api/projects", {
      headers: await createAuthHeaders({
        exp: Math.floor(Date.now() / 1000) - 60,
      }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("redirects browser requests to Access login when unauthenticated", async () => {
    const response = await SELF.fetch("http://localhost/projects", {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
  });

  it("creates the current user profile on first /auth/me and persists updates", async () => {
    const authHeaders = await createAuthHeaders({
      sub: "github|account-user",
      email: "first@example.com",
    });

    const createdResponse = await SELF.fetch("http://localhost/api/auth/me", {
      headers: authHeaders,
    });
    expect(createdResponse.status).toBe(200);
    expect(await createdResponse.json()).toMatchObject({
      id: "github|account-user",
      displayName: "first",
      email: "first@example.com",
    });

    const updatedResponse = await SELF.fetch("http://localhost/api/auth/me", {
      method: "PATCH",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        displayName: "Updated Name",
        email: "updated@example.com",
      }),
    });
    expect(updatedResponse.status).toBe(200);
    expect(await updatedResponse.json()).toMatchObject({
      id: "github|account-user",
      displayName: "Updated Name",
      email: "updated@example.com",
    });

    const reloadedResponse = await SELF.fetch("http://localhost/api/auth/me", {
      headers: await createAuthHeaders({
        sub: "github|account-user",
        email: "access-changed@example.com",
      }),
    });
    expect(reloadedResponse.status).toBe(200);
    expect(await reloadedResponse.json()).toMatchObject({
      id: "github|account-user",
      displayName: "Updated Name",
      email: "updated@example.com",
    });

    const defaultNotificationResponse = await SELF.fetch(
      "http://localhost/api/auth/me/notification-settings",
      { headers: authHeaders },
    );
    expect(defaultNotificationResponse.status).toBe(200);
    expect(await defaultNotificationResponse.json()).toMatchObject({
      userId: "github|account-user",
      emailEnabled: true,
      targetScope: "assigned_only",
      notifyOnStatusChanged: true,
      notifyOnComment: true,
      notifyOnEstimate: true,
    });

    const updatedNotificationResponse = await SELF.fetch(
      "http://localhost/api/auth/me/notification-settings",
      {
        method: "PATCH",
        headers: {
          ...authHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          emailEnabled: false,
          targetScope: "all_stories",
          notifyOnStatusChanged: false,
          notifyOnComment: true,
          notifyOnEstimate: false,
        }),
      },
    );
    expect(updatedNotificationResponse.status).toBe(200);
    expect(await updatedNotificationResponse.json()).toMatchObject({
      userId: "github|account-user",
      emailEnabled: false,
      targetScope: "all_stories",
      notifyOnStatusChanged: false,
      notifyOnComment: true,
      notifyOnEstimate: false,
    });
  });

  it("returns field errors when account input is invalid", async () => {
    const response = await SELF.fetch("http://localhost/api/auth/me", {
      method: "PATCH",
      headers: {
        ...(await createAuthHeaders()),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        displayName: "",
        email: "not-an-email",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "入力内容を修正してください",
      errors: {
        displayName: "表示名を入力してください",
      },
    });
  });

  it("returns field errors when notification setting input is invalid", async () => {
    const response = await SELF.fetch(
      "http://localhost/api/auth/me/notification-settings",
      {
        method: "PATCH",
        headers: {
          ...(await createAuthHeaders()),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          targetScope: "invalid_scope",
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "入力内容を修正してください",
      errors: {
        targetScope:
          "通知対象は「自分の担当のみ」または「全ストーリー」から選択してください",
      },
    });
  });

  it("persists mention notifications and supports cursor/filter/read APIs", async () => {
    const ownerHeaders = await createAuthHeaders({
      sub: "github|owner",
      email: "owner@example.com",
    });
    const memberHeaders = await createAuthHeaders({
      sub: "github|member-1",
      email: "member@example.com",
    });

    const projectResponse = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        ...ownerHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Mention Notifications Project" }),
    });
    expect(projectResponse.status).toBe(201);
    const projectJson = (await projectResponse.json()) as {
      project: { id: string };
    };
    const projectId = projectJson.project.id;

    const db = env.DB as {
      prepare: (sql: string) => {
        bind: (...values: Array<string | number | null>) => {
          run: () => Promise<unknown>;
        };
      };
    };

    await db
      .prepare(
        "insert into project_members (project_id, user_id, role) values (?, ?, ?)",
      )
      .bind(projectId, "github|member-1", "member")
      .run();

    const storyCreateResponse = await SELF.fetch(
      `http://localhost/api/projects/${projectId}/stories`,
      {
        method: "POST",
        headers: {
          ...ownerHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Mention target story",
          description: "initial",
          ownerIds: ["github|owner"],
        }),
      },
    );
    expect(storyCreateResponse.status).toBe(201);
    const storyCreateJson = (await storyCreateResponse.json()) as {
      story: { id: string; storyNumber: number };
    };
    const storyNumber = String(storyCreateJson.story.storyNumber);

    const comment1Response = await SELF.fetch(
      `http://localhost/api/projects/${projectId}/stories/${storyNumber}/comments`,
      {
        method: "POST",
        headers: {
          ...ownerHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          body: "@github|member-1 first mention",
        }),
      },
    );
    expect(comment1Response.status).toBe(201);

    const patchResponse = await SELF.fetch(
      `http://localhost/api/projects/${projectId}/stories/${storyNumber}`,
      {
        method: "PATCH",
        headers: {
          ...ownerHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          description: "description @github|member-1 mention",
        }),
      },
    );
    expect(patchResponse.status).toBe(200);

    const comment2Response = await SELF.fetch(
      `http://localhost/api/projects/${projectId}/stories/${storyNumber}/comments`,
      {
        method: "POST",
        headers: {
          ...ownerHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          body: "@github|member-1 second mention",
        }),
      },
    );
    expect(comment2Response.status).toBe(201);

    const page1Response = await SELF.fetch(
      `http://localhost/api/auth/me/notifications?projectId=${projectId}&kinds=mention&limit=2`,
      {
        headers: memberHeaders,
      },
    );
    expect(page1Response.status).toBe(200);
    const page1Json = (await page1Response.json()) as {
      notifications: Array<{
        id: string;
        kind: string;
        readAt: string | null;
      }>;
      page: {
        hasNext: boolean;
        nextCursor: string | null;
      };
    };
    expect(page1Json.notifications).toHaveLength(2);
    expect(page1Json.notifications.every((n) => n.kind === "mention")).toBe(
      true,
    );
    expect(page1Json.page.hasNext).toBe(true);
    expect(page1Json.page.nextCursor).toBeTruthy();

    const page2Response = await SELF.fetch(
      `http://localhost/api/auth/me/notifications?projectId=${projectId}&kinds=mention&limit=2&cursor=${encodeURIComponent(page1Json.page.nextCursor ?? "")}`,
      {
        headers: memberHeaders,
      },
    );
    expect(page2Response.status).toBe(200);
    const page2Json = (await page2Response.json()) as {
      notifications: Array<{ kind: string }>;
      page: {
        hasNext: boolean;
      };
    };
    expect(page2Json.notifications).toHaveLength(1);
    expect(page2Json.notifications[0]).toMatchObject({ kind: "mention" });
    expect(page2Json.page.hasNext).toBe(false);

    const readResponse = await SELF.fetch(
      "http://localhost/api/auth/me/notifications/read",
      {
        method: "POST",
        headers: {
          ...memberHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          notificationIds: page1Json.notifications.map((n) => n.id),
        }),
      },
    );
    expect(readResponse.status).toBe(200);
    expect(await readResponse.json()).toMatchObject({ updatedCount: 2 });

    const unreadResponse = await SELF.fetch(
      `http://localhost/api/auth/me/notifications?projectId=${projectId}&kinds=mention&unreadOnly=true&limit=10`,
      {
        headers: memberHeaders,
      },
    );
    expect(unreadResponse.status).toBe(200);
    const unreadJson = (await unreadResponse.json()) as {
      notifications: Array<{ readAt: string | null }>;
    };
    expect(unreadJson.notifications).toHaveLength(1);
    expect(unreadJson.notifications[0].readAt).toBeNull();
  });

  it("does not create mention notifications for non-members or self mentions", async () => {
    const ownerHeaders = await createAuthHeaders({
      sub: "github|owner",
      email: "owner@example.com",
    });
    const memberHeaders = await createAuthHeaders({
      sub: "github|member-1",
      email: "member@example.com",
    });

    const projectResponse = await SELF.fetch("http://localhost/api/projects", {
      method: "POST",
      headers: {
        ...ownerHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Mention Validation Project" }),
    });
    expect(projectResponse.status).toBe(201);
    const projectJson = (await projectResponse.json()) as {
      project: { id: string };
    };
    const projectId = projectJson.project.id;

    const db = env.DB as {
      prepare: (sql: string) => {
        bind: (...values: Array<string | number | null>) => {
          run: () => Promise<unknown>;
        };
      };
    };

    await db
      .prepare(
        "insert into project_members (project_id, user_id, role) values (?, ?, ?)",
      )
      .bind(projectId, "github|member-1", "member")
      .run();

    const storyCreateResponse = await SELF.fetch(
      `http://localhost/api/projects/${projectId}/stories`,
      {
        method: "POST",
        headers: {
          ...ownerHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "No mention target story",
          description: "initial",
          ownerIds: ["github|owner"],
        }),
      },
    );
    expect(storyCreateResponse.status).toBe(201);
    const storyCreateJson = (await storyCreateResponse.json()) as {
      story: { id: string; storyNumber: number };
    };
    const storyNumber = String(storyCreateJson.story.storyNumber);

    const commentResponse = await SELF.fetch(
      `http://localhost/api/projects/${projectId}/stories/${storyNumber}/comments`,
      {
        method: "POST",
        headers: {
          ...ownerHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          body: "@github|owner self mention and @github|outsider non-member",
        }),
      },
    );
    expect(commentResponse.status).toBe(201);

    const memberNotificationsResponse = await SELF.fetch(
      `http://localhost/api/auth/me/notifications?projectId=${projectId}&kinds=mention&limit=20`,
      {
        headers: memberHeaders,
      },
    );
    expect(memberNotificationsResponse.status).toBe(200);
    const memberNotificationsJson =
      (await memberNotificationsResponse.json()) as {
        notifications: Array<{ id: string }>;
      };
    expect(memberNotificationsJson.notifications).toHaveLength(0);

    const ownerNotificationsResponse = await SELF.fetch(
      `http://localhost/api/auth/me/notifications?projectId=${projectId}&kinds=mention&limit=20`,
      {
        headers: ownerHeaders,
      },
    );
    expect(ownerNotificationsResponse.status).toBe(200);
    const ownerNotificationsJson =
      (await ownerNotificationsResponse.json()) as {
        notifications: Array<{ id: string }>;
      };
    expect(ownerNotificationsJson.notifications).toHaveLength(0);
  });
});
