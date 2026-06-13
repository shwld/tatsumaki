import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopSettings", {
  getConfig: () => ipcRenderer.invoke("settings:get-config"),
  setBaseUrl: (baseUrl: string) =>
    ipcRenderer.invoke("settings:set-base-url", baseUrl),
});
