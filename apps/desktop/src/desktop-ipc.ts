import { createServer, type Server, type Socket } from "node:net";
import { chmodSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";

export const DESKTOP_IPC_PROTOCOL_VERSION = 1;
const DESKTOP_IPC_SOCKET_NAME = "tatsumaki-desktop-ipc.sock";
const MAX_REQUEST_BYTES = 64 * 1024;

export const DESKTOP_IPC_MESSAGE_TYPES = {
  refetchStories: "refetch:stories",
  refetchScreen: "refetch:screen",
} as const;

export type DesktopIpcMessageType =
  (typeof DESKTOP_IPC_MESSAGE_TYPES)[keyof typeof DESKTOP_IPC_MESSAGE_TYPES];

type DesktopIpcRequest = {
  version: number;
  requestId: string;
  authToken: string;
  type: DesktopIpcMessageType | string;
  payload?: Record<string, unknown>;
};

type DesktopIpcResponse = {
  requestId: string;
  ok: boolean;
  errorCode?:
    | "INVALID_REQUEST"
    | "PROTOCOL_VERSION_MISMATCH"
    | "UNAUTHORIZED"
    | "UNKNOWN_MESSAGE_TYPE"
    | "INTERNAL_ERROR";
  message?: string;
};

export type DesktopIpcRefetchMessage = {
  type: DesktopIpcMessageType;
  payload: Record<string, unknown> | undefined;
  requestId: string;
};

type DesktopIpcRouter = (message: DesktopIpcRefetchMessage) => void;

export type DesktopIpcState = {
  endpoint: string;
  protocolVersion: number;
};

export function resolveDesktopIpcEndpoint(): string {
  const override = process.env.TATSUMAKI_DESKTOP_IPC_ENDPOINT?.trim();
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev && override) return override;

  if (process.platform === "win32") {
    const user = process.env.USERNAME || process.env.USER || "default";
    return `\\\\.\\pipe\\tatsumaki-desktop-${user}`;
  }

  const runtimeDir =
    process.env.XDG_RUNTIME_DIR?.trim() || app.getPath("userData");
  return join(runtimeDir, DESKTOP_IPC_SOCKET_NAME);
}

function isAllowedType(value: string): value is DesktopIpcMessageType {
  return (
    value === DESKTOP_IPC_MESSAGE_TYPES.refetchStories ||
    value === DESKTOP_IPC_MESSAGE_TYPES.refetchScreen
  );
}

function encodeResponse(response: DesktopIpcResponse): string {
  return `${JSON.stringify(response)}\n`;
}

function buildErrorResponse(
  requestId: string,
  errorCode: NonNullable<DesktopIpcResponse["errorCode"]>,
  message: string,
): DesktopIpcResponse {
  return {
    requestId,
    ok: false,
    errorCode,
    message,
  };
}

function parseRequest(raw: string): DesktopIpcRequest {
  const parsed = JSON.parse(raw) as Partial<DesktopIpcRequest>;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.version !== "number" ||
    typeof parsed.requestId !== "string" ||
    typeof parsed.authToken !== "string" ||
    typeof parsed.type !== "string"
  ) {
    throw new Error("invalid request shape");
  }
  return {
    version: parsed.version,
    requestId: parsed.requestId,
    authToken: parsed.authToken,
    type: parsed.type,
    payload:
      parsed.payload && typeof parsed.payload === "object"
        ? (parsed.payload as Record<string, unknown>)
        : undefined,
  };
}

function cleanupUnixSocket(endpoint: string): void {
  if (process.platform === "win32") return;
  if (!existsSync(endpoint)) return;
  unlinkSync(endpoint);
}

export class DesktopIpcServer {
  private server: Server | null = null;
  private readonly router: DesktopIpcRouter;
  private readonly authToken: string;
  private endpoint: string | null = null;

  constructor(router: DesktopIpcRouter, authToken: string) {
    this.router = router;
    this.authToken = authToken;
  }

  async start(): Promise<DesktopIpcState> {
    if (this.server && this.endpoint) {
      return {
        endpoint: this.endpoint,
        protocolVersion: DESKTOP_IPC_PROTOCOL_VERSION,
      };
    }

    const endpoint = resolveDesktopIpcEndpoint();
    if (process.platform !== "win32") {
      mkdirSync(dirname(endpoint), { recursive: true });
      cleanupUnixSocket(endpoint);
    }

    const server = createServer((socket) => this.handleConnection(socket));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(endpoint, () => {
        server.off("error", reject);
        resolve();
      });
    });

    this.server = server;
    this.endpoint = endpoint;
    if (process.platform !== "win32") {
      chmodSync(endpoint, 0o600);
    }
    return {
      endpoint,
      protocolVersion: DESKTOP_IPC_PROTOCOL_VERSION,
    };
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const currentServer = this.server;
    const endpoint = this.endpoint;
    this.server = null;
    this.endpoint = null;

    await new Promise<void>((resolve, reject) => {
      currentServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    if (endpoint && process.platform !== "win32") {
      cleanupUnixSocket(endpoint);
    }
  }

  private handleConnection(socket: Socket): void {
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (buffer.length > MAX_REQUEST_BYTES) {
        socket.end(
          encodeResponse(
            buildErrorResponse(
              "unknown",
              "INVALID_REQUEST",
              `request too large (max ${MAX_REQUEST_BYTES} bytes)`,
            ),
          ),
        );
        return;
      }
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) return;
      const raw = buffer.slice(0, newlineIndex).trim();
      this.processRequest(socket, raw);
    });
  }

  private processRequest(socket: Socket, raw: string): void {
    let requestId = "unknown";
    try {
      const request = parseRequest(raw);
      requestId = request.requestId;

      if (request.version !== DESKTOP_IPC_PROTOCOL_VERSION) {
        socket.end(
          encodeResponse(
            buildErrorResponse(
              request.requestId,
              "PROTOCOL_VERSION_MISMATCH",
              `Unsupported protocol version: ${request.version}`,
            ),
          ),
        );
        return;
      }
      if (!isAllowedType(request.type)) {
        socket.end(
          encodeResponse(
            buildErrorResponse(
              request.requestId,
              "UNKNOWN_MESSAGE_TYPE",
              `Unsupported message type: ${request.type}`,
            ),
          ),
        );
        return;
      }
      if (request.authToken !== this.authToken) {
        socket.end(
          encodeResponse(
            buildErrorResponse(
              request.requestId,
              "UNAUTHORIZED",
              "invalid IPC auth token",
            ),
          ),
        );
        return;
      }

      this.router({
        type: request.type,
        payload: request.payload,
        requestId: request.requestId,
      });
      socket.end(
        encodeResponse({
          requestId: request.requestId,
          ok: true,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "invalid request payload";
      socket.end(
        encodeResponse(
          buildErrorResponse(requestId, "INVALID_REQUEST", message),
        ),
      );
    }
  }
}
