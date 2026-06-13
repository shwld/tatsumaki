import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";

type AppConfig = {
  baseUrl: string;
  desktopIpcEndpoint: string;
  desktopIpcProtocolVersion: number;
  desktopIpcAuthToken: string;
};

const DEFAULT_BASE_URL = "https://tatsumaki.shwld.app";
const DEFAULT_DESKTOP_IPC_ENDPOINT = "";
const DEFAULT_DESKTOP_IPC_PROTOCOL_VERSION = 1;
const DEFAULT_DESKTOP_IPC_AUTH_TOKEN = "";

export function validateHttpsUrl(input: string): URL {
  const parsed = new URL(input);
  if (parsed.protocol !== "https:") {
    throw new Error("Only https URLs are allowed");
  }
  return parsed;
}

function defaultConfig(): AppConfig {
  return {
    baseUrl: DEFAULT_BASE_URL,
    desktopIpcEndpoint: DEFAULT_DESKTOP_IPC_ENDPOINT,
    desktopIpcProtocolVersion: DEFAULT_DESKTOP_IPC_PROTOCOL_VERSION,
    desktopIpcAuthToken: DEFAULT_DESKTOP_IPC_AUTH_TOKEN,
  };
}

export class ConfigStore {
  private readonly path: string;

  constructor() {
    this.path = join(app.getPath("userData"), "desktop-config.json");
  }

  load(): AppConfig {
    if (!existsSync(this.path)) {
      return defaultConfig();
    }

    try {
      const raw = readFileSync(this.path, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      const url = validateHttpsUrl(parsed.baseUrl ?? DEFAULT_BASE_URL);
      return {
        baseUrl: url.toString(),
        desktopIpcEndpoint:
          typeof parsed.desktopIpcEndpoint === "string"
            ? parsed.desktopIpcEndpoint
            : DEFAULT_DESKTOP_IPC_ENDPOINT,
        desktopIpcProtocolVersion:
          typeof parsed.desktopIpcProtocolVersion === "number"
            ? parsed.desktopIpcProtocolVersion
            : DEFAULT_DESKTOP_IPC_PROTOCOL_VERSION,
        desktopIpcAuthToken:
          typeof parsed.desktopIpcAuthToken === "string"
            ? parsed.desktopIpcAuthToken
            : DEFAULT_DESKTOP_IPC_AUTH_TOKEN,
      };
    } catch {
      return defaultConfig();
    }
  }

  save(next: AppConfig): AppConfig {
    const url = validateHttpsUrl(next.baseUrl);
    const normalized = {
      baseUrl: url.toString(),
      desktopIpcEndpoint: next.desktopIpcEndpoint,
      desktopIpcProtocolVersion: next.desktopIpcProtocolVersion,
      desktopIpcAuthToken: next.desktopIpcAuthToken,
    };
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(normalized, null, 2));
    return normalized;
  }
}
