import { useEffect, useMemo, useRef, useState } from "react";
import {
  projectPlanningPokerActiveSessionApiPath,
  projectPlanningPokerSessionWsApiPath,
} from "../lib/story-routes";
import type { PlanningPokerSession } from "../types/planning-poker";

export function usePlanningPokerSession(projectId: string | undefined) {
  const [session, setSession] = useState<PlanningPokerSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!projectId) {
      setSession(null);
      setError(null);
      setLoading(false);
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          projectPlanningPokerActiveSessionApiPath(projectId),
        );
        if (!response.ok) {
          throw new Error(
            `Failed to load planning poker session (${response.status})`,
          );
        }
        const payload = (await response.json()) as {
          session: PlanningPokerSession | null;
        };
        if (!cancelled) {
          setSession(payload.session);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load planning poker session",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}${projectPlanningPokerSessionWsApiPath(projectId, "active")}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as {
          type?: string;
          payload?: { session: PlanningPokerSession | null };
        };
        if (data.type === "session" && data.payload) {
          setSession(data.payload.session);
        }
      } catch {
        // no-op
      }
    };

    return () => {
      cancelled = true;
      ws.close();
      wsRef.current = null;
    };
  }, [projectId]);

  return useMemo(
    () => ({ session, setSession, loading, error }),
    [session, loading, error],
  );
}
