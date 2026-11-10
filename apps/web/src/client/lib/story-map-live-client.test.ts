import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryMapStructure } from "../../domain/entities/story-map";
import {
  type LiveSocket,
  StoryMapLiveClient,
  type StoryMapLiveState,
} from "./story-map-live-client";

const structure = { map: { id: "m" } } as unknown as StoryMapStructure;

class FakeSocket implements LiveSocket {
  readyState: 0 | 1 | 2 | 3 = 1;
  sent: { type: string; opId?: string }[] = [];
  private listeners = new Map<string, ((event: unknown) => void)[]>();

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  receive(message: unknown) {
    this.emit("message", { data: JSON.stringify(message) });
  }
}

const snapshot = (seq: number) => ({
  type: "snapshot",
  seq,
  role: "member",
  structure,
});

describe("StoryMapLiveClient", () => {
  let sockets: FakeSocket[];
  let state: StoryMapLiveState;
  let client: StoryMapLiveClient;

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    client = new StoryMapLiveClient({
      url: "wss://x/live",
      retryDelaysMs: [100, 200],
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onChange: (next) => {
        state = next;
      },
    });
    client.start();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("becomes connected on the snapshot and saved on the ack", () => {
    expect(state?.connection ?? "connecting").toBe("connecting");
    sockets[0].receive(snapshot(4));
    expect(state).toMatchObject({ connection: "connected", seq: 4 });

    const opId = client.send({ type: "addPersona", name: "A" });
    expect(state.save).toBe("saving");
    expect(sockets[0].sent[0]).toMatchObject({ type: "command", opId });
    sockets[0].receive({ type: "ack", opId, seq: 5, result: null });
    expect(state.save).toBe("saved");
  });

  it("resends an unacked command with the same opId after reconnecting", () => {
    sockets[0].receive(snapshot(0));
    const opId = client.send({ type: "addPersona", name: "A" });
    sockets[0].emit("close");
    expect(state.connection).toBe("reconnecting");
    expect(state.save).toBe("saving");

    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(2);
    expect(sockets[1].sent).toEqual([]);
    sockets[1].receive(snapshot(0));
    expect(state.connection).toBe("connected");
    expect(sockets[1].sent).toEqual([
      { type: "command", opId, command: { type: "addPersona", name: "A" } },
    ]);
  });

  it("does not resend pending commands when a snapshot arrives on a live connection", () => {
    sockets[0].receive(snapshot(0));
    client.send({ type: "addPersona", name: "A" });
    expect(sockets[0].sent).toHaveLength(1);
    sockets[0].receive(snapshot(0));
    expect(sockets[0].sent).toHaveLength(1);
  });

  it("sends a rate-limited command again instead of dropping it", () => {
    sockets[0].receive(snapshot(0));
    const opId = client.send({ type: "addPersona", name: "A" });
    sockets[0].receive({ type: "reject", opId, code: "rate_limited" });
    expect(state.save).toBe("saving");
    expect(state.rejections).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(sockets[0].sent.filter((m) => m.opId === opId)).toHaveLength(2);
  });

  it("keeps counting retries when connections drop right after their snapshot", () => {
    sockets[0].receive(snapshot(0));
    sockets[0].emit("close");
    vi.advanceTimersByTime(100);
    sockets[1].receive(snapshot(0));
    sockets[1].emit("close");
    vi.advanceTimersByTime(200);
    sockets[2].receive(snapshot(0));
    sockets[2].emit("close");
    expect(state.connection).toBe("disconnected");
  });

  it("gives up after the retry delays run out", () => {
    sockets[0].receive(snapshot(0));
    sockets[0].emit("close");
    vi.advanceTimersByTime(100);
    sockets[1].emit("close");
    vi.advanceTimersByTime(200);
    sockets[2].emit("close");
    expect(state.connection).toBe("disconnected");
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(3);
  });

  it("does not retry when the server revoked access", () => {
    sockets[0].receive(snapshot(0));
    sockets[0].emit("close", { code: 4403 });
    expect(state.connection).toBe("disconnected");
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
  });

  it("applies the next seq, ignores old ones and asks for a snapshot on a gap", () => {
    sockets[0].receive(snapshot(1));
    sockets[0].receive({
      type: "applied",
      seq: 2,
      opId: "o",
      actorId: "u",
      structure,
    });
    expect(state.seq).toBe(2);
    sockets[0].receive({
      type: "applied",
      seq: 2,
      opId: "o",
      actorId: "u",
      structure,
    });
    expect(state.seq).toBe(2);
    sockets[0].receive({
      type: "applied",
      seq: 5,
      opId: "o",
      actorId: "u",
      structure,
    });
    expect(state.seq).toBe(2);
    expect(sockets[0].sent.at(-1)).toEqual({ type: "resync" });
  });

  it("records a rejection and stops resending that command", () => {
    sockets[0].receive(snapshot(0));
    const opId = client.send({ type: "deleteCard", cardId: "c" });
    sockets[0].receive({ type: "reject", opId, code: "target_gone" });
    expect(state.rejections).toEqual(["target_gone"]);
    expect(state.save).toBe("saved");
  });
});
