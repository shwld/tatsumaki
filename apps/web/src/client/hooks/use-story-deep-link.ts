import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router";

import {
  parseStoryNumberFromHash,
  projectStoryDetailPath,
} from "../lib/story-routes";
import type { Story } from "../types/story";

type UseStoryDeepLinkParams = {
  projectId?: string;
  allStories: Story[];
  isReady: boolean;
  setActiveStoryId: (storyId: string | null) => void;
  setExpandedStoryIds: (updater: (current: Set<string>) => Set<string>) => void;
};

export function useStoryDeepLink({
  projectId,
  allStories,
  isReady,
  setActiveStoryId,
  setExpandedStoryIds,
}: UseStoryDeepLinkParams): void {
  const location = useLocation();
  const navigate = useNavigate();
  const handledHashRef = useRef<string | null>(null);
  const directLinkStoryNumber = useMemo(
    () => parseStoryNumberFromHash(location.hash),
    [location.hash],
  );

  useEffect(() => {
    if (!projectId) return;
    if (!directLinkStoryNumber) {
      handledHashRef.current = null;
      return;
    }
    if (!isReady) return;

    const handledKey = `${projectId}:${directLinkStoryNumber}`;
    if (handledHashRef.current === handledKey) {
      return;
    }

    const matchedStory = allStories.find(
      (story) => String(story.storyNumber) === directLinkStoryNumber,
    );
    if (matchedStory) {
      handledHashRef.current = handledKey;
      setActiveStoryId(matchedStory.id);
      setExpandedStoryIds((current) => {
        if (current.has(matchedStory.id)) return current;
        const next = new Set(current);
        next.add(matchedStory.id);
        return next;
      });
      return;
    }

    handledHashRef.current = handledKey;
    navigate(projectStoryDetailPath(projectId, directLinkStoryNumber), {
      replace: true,
    });
  }, [
    allStories,
    directLinkStoryNumber,
    isReady,
    navigate,
    projectId,
    setActiveStoryId,
    setExpandedStoryIds,
  ]);
}
