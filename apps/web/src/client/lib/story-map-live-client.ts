import { ulid } from "ulid";
import type { ProjectMemberRole } from "../../domain/entities/project-member";
import type { StoryMapStructure } from "../../domain/entities/story-map";
import type {
  StoryMapRejectionCode,
  StoryMapServerMessage,
} from "../../shared/story-map-live-protocol";

export type StoryMapConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

/** saving: a command is waiting for its ack. saved: every command is acked. */
export type StoryMapSaveState = "saved" | "saving";

export type StoryMapLiveState = {
  connection: StoryMapConnectionState;
  save: StoryMapSaveState;
  seq: number;
  role: ProjectMemberRole | null;
  structure: StoryMapStructure | null;
  /** Codes of commands the server refused, oldest first. */
  rejections: StoryMapRejectionCode[];
};

export type LiveSocket = Pick<
  WebSocket,
  "send" | "close" | "addEventListener" | "readyState"
>;

type Options = {
  url: string;
  createSocket?: (url: string) => LiveSocket;
  onChange: (state: StoryMapLiveState) => void;
  /** Delays between reconnect attempts. Running out of them means disconnected. */
  retryDelaysMs?: number[];
};

const OPEN = 1;
/** The map is gone or the user lost access; retrying cannot help. */
const DENIED_CLOSE_CODE = 4404;
const REVOKED_CLOSE_CODE = 4403;
/** A connection counts as recovered only after it stayed up this long. */
const HEALTHY_AFTER_MS = 10_000;
/** The server allows 20 commands per second per socket, so wait a second. */
const RATE_LIMIT_RETRY_MS = 1000;
const DEFAULT_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

/**
 * Keeps a story map in step with its Durable Object (ADR-0014 §3). Commands
 * apply on the server; the client shows what the server confirms. A command
 * that is not acked yet is resent with the same opId after a reconnect, so a
 * lost ack never applies it twice.
 */
export class StoryMapLiveClient {
  private socket: LiveSocket | null = null;
  /** Held while rate-limited commands wait, so later ones cannot overtake them. */
  private paused = false;
  private flushedSocket: LiveSocket | null = null;
  private retry = 0;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private healthyTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pending = new Map<string, unknown>();
  private state: StoryMapLiveState = {
    connection: "connecting",
    save: "saved",
    seq: 0,
    role: null,
    structure: null,
    rejections: [],
  };

  constructor(private readonly options: Options) {}

  start(): void {
    this.open();
  }

  /** Queues a command and returns its opId. Resent until acked or refused. */
  send(command: unknown): string {
    const opId = ulid();
    this.pending.set(opId, command);
    this.update({ save: "saving" });
    this.flush(opId);
    return opId;
  }

  /**
   * Asks for a fresh snapshot. Story attributes shown on cards (title, state,
   * estimate) are not broadcast, so a returning viewer re-reads them (ADR-0014).
   */
  resync(): void {
    if (this.state.connection !== "connected" || !this.socket) return;
    if (this.socket.readyState !== OPEN) return;
    this.socket.send(JSON.stringify({ type: "resync" }));
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.healthyTimer) clearTimeout(this.healthyTimer);
    this.socket?.close(1000, "client closed");
    this.update({ connection: "disconnected" });
  }

  private open(): void {
    const create =
      this.options.createSocket ?? ((url) => new WebSocket(url) as LiveSocket);
    const socket = create(this.options.url);
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      this.onMessage((event as MessageEvent).data);
    });
    socket.addEventListener("close", (event) => {
      if (this.socket !== socket || this.closed) return;
      if (this.healthyTimer) clearTimeout(this.healthyTimer);
      const code = (event as CloseEvent).code;
      if (code === DENIED_CLOSE_CODE || code === REVOKED_CLOSE_CODE) {
        this.socket = null;
        this.update({ connection: "disconnected" });
        return;
      }
      this.reconnect();
    });
    socket.addEventListener("error", () => {
      // A close event follows; reconnecting is handled there.
    });
  }

  private reconnect(): void {
    const delays = this.options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.socket = null;
    if (this.retry >= delays.length) {
      this.update({ connection: "disconnected" });
      return;
    }
    this.update({ connection: "reconnecting" });
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.closed) this.open();
    }, delays[this.retry]);
    this.retry += 1;
  }

  private flush(only?: string): void {
    if (this.paused) return;
    if (this.state.connection !== "connected" || !this.socket) return;
    if (this.socket.readyState !== OPEN) return;
    const ids = only ? [only] : [...this.pending.keys()];
    for (const opId of ids) {
      const command = this.pending.get(opId);
      if (command === undefined) continue;
      this.socket.send(JSON.stringify({ type: "command", opId, command }));
    }
  }

  private onMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let message: StoryMapServerMessage;
    try {
      message = JSON.parse(data) as StoryMapServerMessage;
    } catch {
      return;
    }
    switch (message.type) {
      case "snapshot":
        if (this.healthyTimer) clearTimeout(this.healthyTimer);
        this.healthyTimer = setTimeout(() => {
          this.retry = 0;
        }, HEALTHY_AFTER_MS);
        this.update({
          connection: "connected",
          seq: message.seq,
          role: message.role,
          structure: message.structure,
        });
        // Later snapshots on the same connection answer a refusal or a resync
        // request; resending then would race the commands still in flight.
        if (this.flushedSocket !== this.socket) {
          this.flushedSocket = this.socket;
          this.flush();
        }
        return;
      case "applied":
        if (message.seq <= this.state.seq) return;
        if (message.seq !== this.state.seq + 1) {
          this.socket?.send(JSON.stringify({ type: "resync" }));
          return;
        }
        this.update({ seq: message.seq, structure: message.structure });
        return;
      case "ack":
        this.settle(message.opId);
        return;
      case "reject":
        if (message.code === "rate_limited") {
          // Refused before it ran. Everything still pending goes out again in
          // the original order once the limit window has passed.
          if (!this.paused) {
            this.paused = true;
            setTimeout(() => {
              this.paused = false;
              this.flush();
            }, RATE_LIMIT_RETRY_MS);
          }
          return;
        }
        this.settle(message.opId, message.code);
        return;
    }
  }

  private settle(opId: string, rejection?: StoryMapRejectionCode): void {
    if (!this.pending.delete(opId)) return;
    this.update({
      save: this.pending.size === 0 ? "saved" : "saving",
      ...(rejection
        ? { rejections: [...this.state.rejections, rejection] }
        : {}),
    });
  }

  private update(patch: Partial<StoryMapLiveState>): void {
    this.state = { ...this.state, ...patch };
    this.options.onChange(this.state);
  }
}
