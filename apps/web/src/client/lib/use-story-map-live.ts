import { useCallback, useEffect, useRef, useState } from "react";
import {
  StoryMapLiveClient,
  type StoryMapLiveState,
} from "./story-map-live-client";

const INITIAL: StoryMapLiveState = {
  connection: "connecting",
  save: "saved",
  seq: 0,
  role: null,
  structure: null,
  rejections: [],
};

export function storyMapLiveUrl(projectId: string, mapId: string): string {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/api/projects/${encodeURIComponent(
    projectId,
  )}/story-maps/${encodeURIComponent(mapId)}/live`;
}

/**
 * Connects the open map to its Durable Object (ADR-0014). The state is reset
 * when the route changes so a previous map is never shown under a new one.
 */
export function useStoryMapLive(projectId: string, mapId: string) {
  const [state, setState] = useState<StoryMapLiveState>(INITIAL);
  const clientRef = useRef<StoryMapLiveClient | null>(null);

  useEffect(() => {
    setState(INITIAL);
    if (typeof WebSocket === "undefined" || !projectId || !mapId) return;
    const client = new StoryMapLiveClient({
      url: storyMapLiveUrl(projectId, mapId),
      onChange: setState,
    });
    clientRef.current = client;
    client.start();
    const onVisible = () => {
      if (document.visibilityState === "visible") client.resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      client.close();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [projectId, mapId]);

  const send = useCallback((command: unknown) => {
    clientRef.current?.send(command);
  }, []);

  return { state, send };
}
