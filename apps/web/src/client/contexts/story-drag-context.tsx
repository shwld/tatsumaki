import { createContext, useContext } from "react";
import type { PanelType } from "../lib/panel-visibility";

export type StoryDragState = {
  activeStoryId: string | null;
  overId: string | null;
  allowed: boolean;
  sourcePanel: PanelType | null;
  targetPanel: PanelType | null;
};

export const IDLE_STORY_DRAG_STATE: StoryDragState = {
  activeStoryId: null,
  overId: null,
  allowed: false,
  sourcePanel: null,
  targetPanel: null,
};

const StoryDragContext = createContext<StoryDragState>(IDLE_STORY_DRAG_STATE);

export const StoryDragProvider = StoryDragContext.Provider;

export function useStoryDragState(): StoryDragState {
  return useContext(StoryDragContext);
}
