import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { ConfigStore, validateHttpsUrl } from "./config-store";
import { DesktopIpcServer } from "./desktop-ipc";

const configStore = new ConfigStore();

let hostWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let allowedOrigin = "";
let desktopIpcServer: DesktopIpcServer | null = null;

function isAllowedNavigation(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowed = new URL(allowedOrigin);
    if (parsed.origin === allowed.origin) return true;
    if (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".cloudflareaccess.com")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function lockWebContentsNavigation(webContents: Electron.WebContents): void {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });

  webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
    }
  });
}

function sendToHost(channel: string, payload: unknown): void {
  if (!hostWindow || hostWindow.webContents.isDestroyed()) return;
  hostWindow.webContents.send(channel, payload);
}

function loadHostUrl(baseUrl: string): void {
  const normalized = validateHttpsUrl(baseUrl).toString();
  allowedOrigin = new URL(normalized).origin;
  void hostWindow?.webContents.loadURL(normalized);
}

function createHostWindow(): void {
  const config = configStore.load();
  allowedOrigin = new URL(config.baseUrl).origin;

  hostWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    title: "tatsumaki Desktop",
    webPreferences: {
      preload: join(__dirname, "host-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  hostWindow.on("closed", () => {
    hostWindow = null;
  });

  lockWebContentsNavigation(hostWindow.webContents);
  void hostWindow.webContents.loadURL(config.baseUrl);
}

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 240,
    title: "tatsumaki Desktop Settings",
    parent: hostWindow ?? undefined,
    modal: Boolean(hostWindow),
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: join(__dirname, "settings-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  void settingsWindow.loadFile(join(__dirname, "../static/settings.html"));
}

function setApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Settings...",
          accelerator: "CmdOrCtrl+,",
          click: () => createSettingsWindow(),
        },
        {
          label: "Reload Viewer",
          accelerator: "CmdOrCtrl+R",
          click: () => hostWindow?.webContents.reload(),
        },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerSettingsIpc(): void {
  ipcMain.handle("settings:get-config", () => configStore.load());
  ipcMain.handle("settings:set-base-url", (_, baseUrl: string) => {
    const normalized = validateHttpsUrl(baseUrl).toString();
    const saved = configStore.save({
      ...configStore.load(),
      baseUrl: normalized,
    });
    loadHostUrl(saved.baseUrl);
    return saved;
  });
}

app.whenReady().then(() => {
  registerSettingsIpc();
  setApplicationMenu();
  createHostWindow();

  const current = configStore.load();
  const desktopIpcAuthToken =
    current.desktopIpcAuthToken.trim().length > 0
      ? current.desktopIpcAuthToken
      : randomBytes(24).toString("hex");
  if (desktopIpcAuthToken !== current.desktopIpcAuthToken) {
    configStore.save({
      ...current,
      desktopIpcAuthToken,
    });
  }

  desktopIpcServer = new DesktopIpcServer((message) => {
    sendToHost("desktop-ipc:refetch", {
      requestId: message.requestId,
      type: message.type,
      payload: message.payload,
    });
  }, desktopIpcAuthToken);
  void desktopIpcServer
    .start()
    .then((ipcState) => {
      const next = configStore.load();
      configStore.save({
        ...next,
        desktopIpcEndpoint: ipcState.endpoint,
        desktopIpcProtocolVersion: ipcState.protocolVersion,
        desktopIpcAuthToken,
      });
    })
    .catch((error: Error) => {
      console.error(
        error?.message ??
          "desktop IPC failed to start; desktop refetch is unavailable",
      );
    });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createHostWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void desktopIpcServer?.stop();
});
