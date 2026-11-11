import {
  applyStoryMapCommand,
  parseStoryMapCommand,
  type StoryMapCommandRejection,
} from "../application/usecases/story-map-commands";
import { getStoryMap } from "../application/usecases/manage-story-maps";
import type { ProjectMemberRole } from "../domain/entities/project-member";
import type { StoryMapStructure } from "../domain/entities/story-map";
import { D1ProjectRepository } from "../infrastructure/db/repositories/d1-project-repository";
import { D1StoryMapRepository } from "../infrastructure/db/repositories/d1-story-map-repository";
import {
  STORY_MAP_LIVE_LIMITS,
  type StoryMapClientMessage,
  type StoryMapServerMessage,
} from "../shared/story-map-live-protocol";

type Bindings = { DB: D1Database };

type Attachment = {
  userId: string;
  role: ProjectMemberRole;
  projectId: string;
  mapId: string;
};

type CommandOutcome =
  | { kind: "rejected"; code: StoryMapCommandRejection }
  | {
      kind: "acked";
      seq: number;
      result: unknown;
      duplicate: boolean;
      publish?: () => Promise<void>;
    };

const REJECTION_STATUS: Record<
  StoryMapCommandRejection,
  400 | 403 | 404 | 409 | 500
> = {
  invalid: 400,
  forbidden: 403,
  not_found: 404,
  target_gone: 404,
  archived: 409,
  story_unavailable: 409,
  limit: 409,
  internal: 500,
};

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const OP_RETENTION_MS = 24 * 60 * 60 * 1000;
const MEMBERSHIP_RECHECK_MS = 5 * 60 * 1000;

/**
 * The single writer of one story map (ADR-0014). The Worker route has already
 * checked the session, the project membership and that the map belongs to the
 * project; it passes the identity in headers only this object's stub can set.
 */
export class StoryMapDO {
  private queue: Promise<unknown> = Promise.resolve();
  /** Command timestamps per socket, for the rate limit. Lost on hibernation. */
  private readonly recent = new WeakMap<WebSocket, number[]>();
  /** Same limit for HTTP commands, per user. */
  private readonly httpRecent = new Map<string, number[]>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Bindings,
  ) {}

  private deps() {
    return {
      storyMapRepository: new D1StoryMapRepository(this.env.DB),
      projectRepository: new D1ProjectRepository(this.env.DB),
    };
  }

  /** One operation at a time: D1 calls are not covered by the input gate. */
  private serialized<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async fetch(request: Request): Promise<Response> {
    const isCommand = request.method === "POST";
    if (
      !isCommand &&
      request.headers.get("upgrade")?.toLowerCase() !== "websocket"
    ) {
      return new Response("Expected websocket", { status: 426 });
    }
    const userId = request.headers.get("x-user-id");
    const role = request.headers.get("x-member-role");
    const projectId = request.headers.get("x-project-id");
    const mapId = request.headers.get("x-map-id");
    if (
      !userId ||
      !projectId ||
      !mapId ||
      (role !== "owner" && role !== "member" && role !== "viewer")
    ) {
      return new Response("Missing auth context", { status: 400 });
    }
    if (isCommand) {
      return this.handleHttpCommand(request, {
        userId,
        role,
        projectId,
        mapId,
      });
    }
    if (
      this.state.getWebSockets().length >= STORY_MAP_LIVE_LIMITS.maxConnections
    ) {
      return new Response("Too many connections", { status: 503 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    const attachment: Attachment = { userId, role, projectId, mapId };
    server.serializeAttachment(attachment);
    if ((await this.state.storage.getAlarm()) === null) {
      await this.state.storage.setAlarm(Date.now() + MEMBERSHIP_RECHECK_MS);
    }
    await this.serialized(() => this.sendSnapshot(server, attachment));
    return new Response(null, { status: 101, webSocket: client });
  }

  private send(ws: WebSocket, message: StoryMapServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // The socket is closing; the close handler cleans up.
    }
  }

  private async load(
    attachment: Attachment,
  ): Promise<StoryMapStructure | "gone" | "error"> {
    const loaded = await getStoryMap(this.deps(), attachment);
    if (loaded.isOk()) return loaded.value;
    return loaded.error === "STORY_MAP_NOT_FOUND_ERROR" ||
      loaded.error === "STORY_MAP_FORBIDDEN_ERROR"
      ? "gone"
      : "error";
  }

  private async sendSnapshot(
    ws: WebSocket,
    attachment: Attachment,
  ): Promise<void> {
    const structure = await this.load(attachment);
    if (typeof structure === "string") {
      ws.close(structure === "gone" ? 4404 : 1011, "snapshot unavailable");
      return;
    }
    const seq = await this.deps().storyMapRepository.getSeq(attachment.mapId);
    if (seq.isErr()) {
      ws.close(1011, "snapshot unavailable");
      return;
    }
    this.send(ws, {
      type: "snapshot",
      seq: seq.value,
      role: attachment.role,
      structure,
    });
  }

  async webSocketMessage(
    ws: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) {
      ws.close(1011, "missing attachment");
      return;
    }
    const size =
      typeof raw === "string"
        ? new TextEncoder().encode(raw).length
        : raw.byteLength;
    if (
      typeof raw !== "string" ||
      size > STORY_MAP_LIVE_LIMITS.maxMessageBytes
    ) {
      ws.close(1009, "message too large");
      return;
    }
    const message = parseClientMessage(raw);
    if (!message) {
      ws.close(1003, "invalid message");
      return;
    }
    if (message.type === "resync") {
      await this.serialized(() => this.sendSnapshot(ws, attachment));
      return;
    }
    if (this.exceedsRate(ws)) {
      this.send(ws, {
        type: "reject",
        opId: message.opId,
        code: "rate_limited",
      });
      return;
    }
    await this.serialized(() => this.handleCommand(ws, attachment, message));
  }

  private exceedsHttpRate(userId: string): boolean {
    const now = Date.now();
    const stamps = (this.httpRecent.get(userId) ?? []).filter(
      (at) => now - at < 1000,
    );
    stamps.push(now);
    this.httpRecent.set(userId, stamps);
    return stamps.length > STORY_MAP_LIVE_LIMITS.commandsPerSecond;
  }

  private exceedsRate(ws: WebSocket): boolean {
    const now = Date.now();
    const stamps = (this.recent.get(ws) ?? []).filter((at) => now - at < 1000);
    stamps.push(now);
    this.recent.set(ws, stamps);
    return stamps.length > STORY_MAP_LIVE_LIMITS.commandsPerSecond;
  }

  /**
   * Runs one command through the same path as a socket command, so an HTTP
   * write is serialized with and broadcast to the live editors (ADR-0014).
   */
  private async handleHttpCommand(
    request: Request,
    attachment: Attachment,
  ): Promise<Response> {
    if (this.exceedsHttpRate(attachment.userId)) {
      return Response.json({ code: "rate_limited" }, { status: 429 });
    }
    const raw = await request.text();
    if (
      new TextEncoder().encode(raw).length >
      STORY_MAP_LIVE_LIMITS.maxMessageBytes
    ) {
      return Response.json({ code: "invalid" }, { status: 413 });
    }
    let body: unknown = null;
    try {
      body = JSON.parse(raw);
    } catch {
      // Falls through to the missing opId rejection below.
    }
    const message =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)
        : {};
    if (typeof message.opId !== "string") {
      return Response.json({ code: "invalid" }, { status: 400 });
    }
    const opId = message.opId;
    // Publishing stays inside the serialized step so a later command cannot
    // be applied or broadcast before this one's event goes out.
    const outcome = await this.serialized(async () => {
      const ran = await this.runCommand(attachment, opId, message.command);
      if (ran.kind === "acked") await ran.publish?.();
      return ran;
    });
    if (outcome.kind === "rejected") {
      return Response.json(
        { code: outcome.code },
        { status: REJECTION_STATUS[outcome.code] },
      );
    }
    return Response.json({
      seq: outcome.seq,
      result: outcome.result,
      duplicate: outcome.duplicate,
    });
  }

  private async handleCommand(
    ws: WebSocket,
    attachment: Attachment,
    message: Extract<StoryMapClientMessage, { type: "command" }>,
  ): Promise<void> {
    const { opId } = message;
    const outcome = await this.runCommand(attachment, opId, message.command);
    if (outcome.kind === "rejected") {
      this.send(ws, { type: "reject", opId, code: outcome.code });
      if (outcome.code === "target_gone" || outcome.code === "not_found") {
        await this.sendSnapshot(ws, attachment);
      }
      return;
    }
    this.send(ws, {
      type: "ack",
      opId,
      seq: outcome.seq,
      result: outcome.result,
      duplicate: outcome.duplicate,
    });
    if (outcome.duplicate) {
      await this.sendSnapshot(ws, attachment);
      return;
    }
    await outcome.publish?.();
  }

  private async runCommand(
    attachment: Attachment,
    opId: string,
    rawCommand: unknown,
  ): Promise<CommandOutcome> {
    const reject = (code: StoryMapCommandRejection): CommandOutcome => ({
      kind: "rejected",
      code,
    });
    if (!ULID.test(opId)) {
      return reject("invalid");
    }
    const command = parseStoryMapCommand(rawCommand);
    if (command.isErr()) {
      return reject("invalid");
    }

    const deps = this.deps();
    const repository = deps.storyMapRepository;

    const recorded = await repository.findOp(attachment.mapId, opId);
    if (recorded.isErr()) {
      return reject("internal");
    }
    if (recorded.value) {
      if (recorded.value.userId !== attachment.userId) {
        return reject("invalid");
      }
      return {
        kind: "acked",
        seq: recorded.value.seq,
        result: JSON.parse(recorded.value.result),
        duplicate: true,
      };
    }

    const structure = await deps.storyMapRepository.getStructure(
      attachment.projectId,
      attachment.mapId,
    );
    if (structure.isErr()) {
      return reject("internal");
    }
    if (!structure.value) {
      return reject("not_found");
    }

    const applied = await applyStoryMapCommand(
      deps,
      attachment,
      structure.value,
      command.value,
    );
    if (applied.isErr()) {
      return reject(applied.error);
    }

    const seq = await repository.recordOp({
      mapId: attachment.mapId,
      opId,
      userId: attachment.userId,
      result: JSON.stringify(applied.value ?? null),
    });
    if (seq.isErr()) {
      return reject("internal");
    }
    return {
      kind: "acked",
      seq: seq.value,
      result: applied.value ?? null,
      duplicate: false,
      publish: () => this.publish(attachment, seq.value, opId),
    };
  }

  private async publish(
    attachment: Attachment,
    seq: number,
    opId: string,
  ): Promise<void> {
    const next = await this.load(attachment);
    if (typeof next === "string") {
      // The edit is saved but cannot be shown. Reconnecting makes every client
      // fetch a snapshot instead of staying stale with no gap to detect.
      for (const peer of this.state.getWebSockets()) {
        peer.close(1011, "state unavailable");
      }
      return;
    }
    for (const peer of this.state.getWebSockets()) {
      const peerAttachment = peer.deserializeAttachment() as Attachment | null;
      if (peerAttachment?.mapId !== attachment.mapId) continue;
      this.send(peer, {
        type: "applied",
        seq,
        opId,
        actorId: attachment.userId,
        structure: next,
      });
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, reason);
    } catch {
      // Already closed.
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, "error");
    } catch {
      // Already closed.
    }
  }

  /**
   * Writes re-check membership every time; this closes subscriptions of users
   * who were removed or whose map is gone, and refreshes changed roles.
   */
  async alarm(): Promise<void> {
    const projects = new D1ProjectRepository(this.env.DB);
    const sockets = this.state.getWebSockets();
    for (const ws of sockets) {
      const attachment = ws.deserializeAttachment() as Attachment | null;
      if (!attachment) {
        ws.close(1011, "missing attachment");
        continue;
      }
      const member = await projects.findMember(
        attachment.projectId,
        attachment.userId,
      );
      if (member.isErr()) continue;
      if (!member.value) {
        ws.close(4403, "membership revoked");
        continue;
      }
      if (member.value.role !== attachment.role) {
        const refreshed = { ...attachment, role: member.value.role };
        ws.serializeAttachment(refreshed);
        await this.serialized(() => this.sendSnapshot(ws, refreshed));
      }
    }
    const first = sockets[0]?.deserializeAttachment() as Attachment | null;
    if (first) {
      await this.deps().storyMapRepository.pruneOps(
        first.mapId,
        new Date(Date.now() - OP_RETENTION_MS).toISOString(),
      );
    }
    if (this.state.getWebSockets().length > 0) {
      await this.state.storage.setAlarm(Date.now() + MEMBERSHIP_RECHECK_MS);
    }
  }
}

function parseClientMessage(raw: string): StoryMapClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const message = value as Record<string, unknown>;
  if (message.type === "resync") return { type: "resync" };
  if (message.type === "command" && typeof message.opId === "string") {
    return { type: "command", opId: message.opId, command: message.command };
  }
  return null;
}
