import { ipcRenderer } from "electron";

ipcRenderer.on("desktop-ipc:refetch", (_, payload: unknown) => {
  window.dispatchEvent(
    new CustomEvent("tatsumaki:desktop-ipc-refetch", {
      detail: payload,
    }),
  );
});
