import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuthError } from "../contexts/auth-error-context";
import {
  fetchStoryMap,
  sendStoryMapCommand,
  type StoryMapDetail,
  type StoryMapMetadataCommand,
} from "./story-maps-api";
import { useStoryMapLive } from "./use-story-map-live";

export type StoryMapMessage = { kind: "error" | "status"; text: string };

const metaKey = (structure: StoryMapDetail["structure"]) =>
  JSON.stringify([
    structure.map.title,
    structure.map.achievementGoal,
    structure.map.archivedAt,
  ]);

export function useStoryMapDetail(projectId: string, mapId: string) {
  const { t } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const [loaded, setLoaded] = useState<StoryMapDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<StoryMapMessage | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoadError(false);
    void fetchStoryMap(projectId, mapId).then((result) => {
      if (ignore) return;
      if (!result.ok) {
        if (result.status === 401) return notifySessionExpired();
        return setLoadError(true);
      }
      setLoaded(result.value);
    });
    return () => {
      ignore = true;
    };
  }, [projectId, mapId, reloadKey, notifySessionExpired]);

  // The previous map stays in state while the next one loads; never edit it
  // under the new route.
  const detail = loaded?.structure.map.id === mapId ? loaded : null;

  const live = useStoryMapLive(projectId, mapId);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  // Another editor's metadata change arrives over the socket; refetch so the
  // screen follows it.
  const liveMeta = live.state.structure ? metaKey(live.state.structure) : null;
  const loadedMeta = loaded ? metaKey(loaded.structure) : null;
  useEffect(() => {
    if (liveMeta !== null && loadedMeta !== null && liveMeta !== loadedMeta) {
      reload();
    }
  }, [liveMeta, loadedMeta, reload]);

  const run = async (
    command: StoryMapMetadataCommand,
    successText: string | null,
  ): Promise<boolean> => {
    setBusy(true);
    setMessage(null);
    const result = await sendStoryMapCommand(projectId, mapId, command);
    setBusy(false);
    if (result.ok) {
      if (successText) setMessage({ kind: "status", text: successText });
      reload();
      return true;
    }
    if (result.status === 401) {
      notifySessionExpired();
      return false;
    }
    const text =
      result.status === 403
        ? t("storyMapEditScreen.forbidden")
        : result.code === "INVALID_INPUT" || result.code === "invalid"
          ? t("storyMapEditScreen.titleRequired")
          : result.status === 409
            ? t("storyMapEditScreen.archivedConflict")
            : t("storyMapEditScreen.actionFailed");
    setMessage({ kind: "error", text });
    reload();
    return false;
  };

  return {
    detail,
    loadError,
    reload,
    live,
    run,
    busy,
    message,
    setMessage,
  };
}
