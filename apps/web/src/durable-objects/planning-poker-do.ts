import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { updateStory } from "../application/usecases/update-story";
import { getPointScale } from "../domain/entities/project";
import { createDb } from "../infrastructure/db/client";
import { D1NotificationRepository } from "../infrastructure/db/repositories/d1-notification-repository";
import { D1ProjectRepository } from "../infrastructure/db/repositories/d1-project-repository";
import { D1StoryActivityRepository } from "../infrastructure/db/repositories/d1-story-activity-repository";
import { D1StoryRepository } from "../infrastructure/db/repositories/d1-story-repository";
import { storiesTable } from "../infrastructure/db/schema";

type Vote = { userId: string; point: number; updatedAt: string };
type Participant = { userId: string; connected: boolean };
type SessionStatus = "Open" | "Revealed" | "Closed";
type Session = {
  id: string;
  projectId: string;
  storyId: string;
  storyTitle: string;
  status: SessionStatus;
  consensusPoint: number | null;
  createdBy: string;
  revealedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  votes: Vote[];
};

type Bindings = { DB: D1Database };

function isValidPoint(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function sessionResponse(session: Session | null, viewerUserId: string) {
  if (!session) return { session: null };
  const isRevealed = session.status !== "Open";
  const myVote = session.votes.find((v) => v.userId === viewerUserId) ?? null;
  return {
    session: {
      ...session,
      totalVotes: session.votes.length,
      myVotePoint: isRevealed ? (myVote?.point ?? null) : null,
      viewerHasVoted: myVote !== null,
      votes: [...session.votes]
        .sort((a: Vote, b: Vote) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .map((vote) => ({
          userId: vote.userId,
          point: isRevealed ? vote.point : null,
          updatedAt: vote.updatedAt,
          revealed: isRevealed,
        })),
    },
  };
}

export class PlanningPokerDO {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Bindings,
  ) {}

  private sockets = new Set<WebSocket>();
  private socketUsers = new Map<WebSocket, string>();
  private activeParticipants(): Participant[] {
    const userIds = new Set<string>();
    for (const userId of this.socketUsers.values()) {
      userIds.add(userId);
    }
    return [...userIds].sort().map((userId) => ({ userId, connected: true }));
  }

  private async getActiveSession(): Promise<Session | null> {
    return (await this.state.storage.get<Session>("activeSession")) ?? null;
  }

  private async setActiveSession(session: Session | null): Promise<void> {
    if (session) {
      await this.state.storage.put("activeSession", session);
      return;
    }
    await this.state.storage.delete("activeSession");
  }

  private broadcastSession(session: Session | null): void {
    const participants = this.activeParticipants();
    for (const socket of this.sockets) {
      try {
        const viewerUserId = this.socketUsers.get(socket);
        if (!viewerUserId) {
          this.sockets.delete(socket);
          continue;
        }
        socket.send(
          JSON.stringify({
            type: "session",
            payload: this.sessionResponseWithParticipants(
              session,
              viewerUserId,
              participants,
            ),
          }),
        );
      } catch {
        this.socketUsers.delete(socket);
        this.sockets.delete(socket);
      }
    }
  }

  private sessionResponseWithParticipants(
    session: Session | null,
    viewerUserId: string,
    participants: Participant[] = this.activeParticipants(),
  ) {
    const payload = sessionResponse(session, viewerUserId);
    if (!payload.session) return payload;
    return {
      session: {
        ...payload.session,
        participants,
      },
    };
  }

  private parseSessionId(pathname: string): string | null {
    const match = pathname.match(/^\/sessions\/([^/]+)(?:\/|$)/);
    return match?.[1] ?? null;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const userId = url.searchParams.get("userId");
      if (!userId) {
        return Response.json(
          { error: "Missing websocket user" },
          { status: 400 },
        );
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sockets.add(server);
      this.socketUsers.set(server, userId);
      void this.getActiveSession().then((activeSession) => {
        this.broadcastSession(activeSession);
      });
      server.addEventListener("close", () => {
        this.socketUsers.delete(server);
        this.sockets.delete(server);
        void this.getActiveSession().then((activeSession) => {
          this.broadcastSession(activeSession);
        });
      });
      return new Response(null, { status: 101, webSocket: client });
    }

    const projectId = request.headers.get("x-project-id");
    const userId = request.headers.get("x-user-id");
    const userEmail =
      request.headers.get("x-user-email") ?? userId ?? "unknown";
    if (!projectId || !userId) {
      return Response.json({ error: "Missing auth context" }, { status: 400 });
    }

    const db = createDb(this.env.DB);
    const session = await this.getActiveSession();

    if (url.pathname === "/sessions/active" && request.method === "GET") {
      return Response.json(
        this.sessionResponseWithParticipants(session, userId),
      );
    }

    if (url.pathname === "/sessions" && request.method === "POST") {
      let body: { storyId?: string; replaceActive?: boolean };
      try {
        body = (await request.json()) as { storyId?: string };
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      if (!body?.storyId) {
        return Response.json({ error: "storyId is required" }, { status: 400 });
      }
      const storyRows = await db
        .select({ id: storiesTable.id, title: storiesTable.title })
        .from(storiesTable)
        .where(
          and(
            eq(storiesTable.projectId, projectId),
            eq(storiesTable.id, body.storyId),
          ),
        )
        .limit(1);
      if (storyRows.length === 0) {
        return Response.json({ error: "Story not found" }, { status: 404 });
      }
      const now = new Date().toISOString();
      const current = session;
      if (
        current &&
        current.storyId === body.storyId &&
        current.status === "Open"
      ) {
        return Response.json(
          this.sessionResponseWithParticipants(current, userId),
          {
            status: 200,
          },
        );
      }
      if (
        current &&
        current.status === "Open" &&
        current.storyId !== body.storyId &&
        body.replaceActive !== true
      ) {
        return Response.json(
          {
            error:
              "Another planning poker session is already open for this project",
          },
          { status: 409 },
        );
      }
      const next: Session = {
        id: ulid(),
        projectId,
        storyId: body.storyId,
        storyTitle: storyRows[0].title,
        status: "Open",
        consensusPoint: null,
        createdBy: userId,
        revealedAt: null,
        closedAt: null,
        createdAt: now,
        updatedAt: now,
        votes: [],
      };
      await this.setActiveSession(next);
      this.broadcastSession(next);
      return Response.json(this.sessionResponseWithParticipants(next, userId), {
        status: 201,
      });
    }

    if (!session) {
      return Response.json(
        { error: "Planning poker session not found" },
        { status: 404 },
      );
    }

    const sessionId = this.parseSessionId(url.pathname);
    if (sessionId && session.id !== sessionId) {
      return Response.json(
        { error: "Planning poker session not found" },
        { status: 404 },
      );
    }

    if (
      url.pathname === `/sessions/${session.id}` &&
      request.method === "GET"
    ) {
      return Response.json(
        this.sessionResponseWithParticipants(session, userId),
      );
    }

    if (
      url.pathname === `/sessions/${session.id}/votes` &&
      request.method === "POST"
    ) {
      if (session.status !== "Open") {
        return Response.json(
          { error: "Voting is closed for this session" },
          { status: 409 },
        );
      }
      let body: { point?: unknown };
      try {
        body = (await request.json()) as { point?: unknown };
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      if (!isValidPoint(body?.point)) {
        return Response.json(
          { error: "point must be a non-negative integer" },
          { status: 400 },
        );
      }
      const now = new Date().toISOString();
      const votes = session.votes.filter((v) => v.userId !== userId);
      votes.push({ userId, point: body.point, updatedAt: now });
      const next: Session = { ...session, votes, updatedAt: now };
      await this.setActiveSession(next);
      this.broadcastSession(next);
      return Response.json(this.sessionResponseWithParticipants(next, userId));
    }

    if (
      url.pathname === `/sessions/${session.id}/reveal` &&
      request.method === "POST"
    ) {
      if (session.status !== "Open") {
        return Response.json(
          { error: "Session not found or already revealed/closed" },
          { status: 409 },
        );
      }
      const now = new Date().toISOString();
      const next: Session = {
        ...session,
        status: "Revealed",
        revealedAt: now,
        updatedAt: now,
      };
      await this.setActiveSession(next);
      this.broadcastSession(next);
      return Response.json(this.sessionResponseWithParticipants(next, userId));
    }

    if (
      url.pathname === `/sessions/${session.id}/apply` &&
      request.method === "POST"
    ) {
      if (session.status !== "Revealed") {
        return Response.json(
          { error: "Session must be revealed before applying" },
          { status: 409 },
        );
      }
      let body: { storyPoint?: unknown };
      try {
        body = (await request.json()) as { storyPoint?: unknown };
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      if (!isValidPoint(body?.storyPoint)) {
        return Response.json(
          { error: "storyPoint must be a non-negative integer" },
          { status: 400 },
        );
      }

      const projectRepository = new D1ProjectRepository(this.env.DB);
      const projectResult = await projectRepository.findById(projectId);
      if (projectResult.isErr() || !projectResult.value) {
        return Response.json({ error: "Project not found" }, { status: 404 });
      }
      const allowedStoryPoints = getPointScale(
        projectResult.value.pointScaleType,
        projectResult.value.customPointScale,
      );
      const updateResult = await updateStory(
        new D1StoryRepository(this.env.DB),
        new D1StoryActivityRepository(this.env.DB),
        {
          projectId,
          id: session.storyId,
          storyPoint: body.storyPoint,
          allowedStoryPoints,
          actor: { id: userId, name: userEmail },
        },
        { notificationRepository: new D1NotificationRepository(this.env.DB) },
      );

      if (updateResult.isErr()) {
        return Response.json(
          { error: "Failed to update story point" },
          { status: 400 },
        );
      }

      const now = new Date().toISOString();
      const next: Session = {
        ...session,
        status: "Closed",
        consensusPoint: body.storyPoint,
        closedAt: now,
        updatedAt: now,
      };
      await this.setActiveSession(null);
      this.broadcastSession(null);
      return Response.json({
        ...this.sessionResponseWithParticipants(next, userId),
        story: updateResult.value,
      });
    }

    if (
      url.pathname === `/sessions/${session.id}/close` &&
      request.method === "POST"
    ) {
      if (session.status === "Closed") {
        await this.setActiveSession(null);
        this.broadcastSession(null);
        return Response.json(
          this.sessionResponseWithParticipants(null, userId),
        );
      }
      const now = new Date().toISOString();
      const next: Session = {
        ...session,
        status: "Closed",
        closedAt: now,
        updatedAt: now,
      };
      await this.setActiveSession(null);
      this.broadcastSession(null);
      return Response.json(this.sessionResponseWithParticipants(next, userId));
    }

    if (
      url.pathname === `/sessions/${session.id}/reset` &&
      request.method === "POST"
    ) {
      if (session.status !== "Revealed") {
        return Response.json(
          { error: "Session must be revealed before resetting" },
          { status: 409 },
        );
      }
      const now = new Date().toISOString();
      const next: Session = {
        ...session,
        status: "Open",
        consensusPoint: null,
        revealedAt: null,
        closedAt: null,
        updatedAt: now,
        votes: [],
      };
      await this.setActiveSession(next);
      this.broadcastSession(next);
      return Response.json(this.sessionResponseWithParticipants(next, userId));
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
