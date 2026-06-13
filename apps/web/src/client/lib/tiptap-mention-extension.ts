import { Mention } from "@tiptap/extension-mention";
import type { SuggestionProps } from "@tiptap/suggestion";
import type { ProjectMemberProfile } from "../types/project";

type MentionSuggestionItem = {
  id: string;
  label: string;
};

type MentionRenderProps = SuggestionProps<
  MentionSuggestionItem,
  MentionSuggestionItem
>;

type MentionKeyDownProps = {
  event: KeyboardEvent;
};

function createMentionSuggestionRenderer() {
  let root: HTMLDivElement | null = null;
  let list: HTMLDivElement | null = null;
  let selectedIndex = 0;
  let currentItems: MentionSuggestionItem[] = [];
  let currentCommand: MentionRenderProps["command"] | null = null;

  const renderItems = () => {
    if (!list) {
      return;
    }
    const targetList = list;
    targetList.innerHTML = "";
    currentItems.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "w-full rounded px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-700";
      if (index === selectedIndex) {
        button.className =
          "w-full rounded bg-blue-50 px-2 py-1 text-left text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-200";
      }
      button.textContent = `@${item.label}`;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        currentCommand?.({
          id: item.id,
          label: item.label,
        });
      });
      targetList.appendChild(button);
    });
  };

  const updatePosition = (clientRect?: (() => DOMRect | null) | null) => {
    if (!root || !clientRect) {
      return;
    }
    const rect = clientRect();
    if (!rect) {
      return;
    }
    root.style.left = `${rect.left + window.scrollX}px`;
    root.style.top = `${rect.bottom + window.scrollY + 6}px`;
  };

  return {
    onStart(props: MentionRenderProps) {
      currentItems = props.items;
      currentCommand = props.command;
      selectedIndex = 0;

      root = document.createElement("div");
      root.className =
        "z-50 min-w-40 rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800";
      root.style.position = "absolute";
      list = document.createElement("div");
      list.className = "max-h-48 overflow-y-auto";
      root.appendChild(list);
      document.body.appendChild(root);

      updatePosition(props.clientRect);
      renderItems();
    },
    onUpdate(props: MentionRenderProps) {
      currentItems = props.items;
      currentCommand = props.command;
      if (selectedIndex >= currentItems.length) {
        selectedIndex = Math.max(0, currentItems.length - 1);
      }
      updatePosition(props.clientRect);
      renderItems();
    },
    onKeyDown(props: MentionKeyDownProps) {
      if (currentItems.length === 0) {
        return false;
      }
      if (props.event.key === "ArrowDown") {
        props.event.preventDefault();
        selectedIndex = (selectedIndex + 1) % currentItems.length;
        renderItems();
        return true;
      }
      if (props.event.key === "ArrowUp") {
        props.event.preventDefault();
        selectedIndex =
          (selectedIndex - 1 + currentItems.length) % currentItems.length;
        renderItems();
        return true;
      }
      if (props.event.key === "Enter") {
        props.event.preventDefault();
        const item = currentItems[selectedIndex];
        if (item) {
          currentCommand?.({
            id: item.id,
            label: item.label,
          });
          return true;
        }
      }
      if (props.event.key === "Escape") {
        if (root?.parentNode) {
          root.parentNode.removeChild(root);
        }
        root = null;
        list = null;
        currentItems = [];
        currentCommand = null;
        selectedIndex = 0;
        return true;
      }
      return false;
    },
    onExit() {
      if (root?.parentNode) {
        root.parentNode.removeChild(root);
      }
      root = null;
      list = null;
      currentItems = [];
      currentCommand = null;
      selectedIndex = 0;
    },
  };
}

export function createAppMentionExtension(
  getMentionCandidates: () => ProjectMemberProfile[],
) {
  return Mention.configure({
    HTMLAttributes: {
      class:
        "rounded bg-blue-50 px-1 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    },
    renderText({ node }) {
      return `@${node.attrs.label ?? node.attrs.id}`;
    },
    suggestion: {
      char: "@",
      items: ({ query }: { query: string }) => {
        const mentionCandidates = getMentionCandidates();
        const normalizedQuery = query.trim().toLowerCase();
        const matches =
          normalizedQuery.length === 0
            ? mentionCandidates
            : mentionCandidates.filter((candidate) => {
                const displayName = candidate.displayName.toLowerCase();
                const id = candidate.id.toLowerCase();
                return (
                  displayName.includes(normalizedQuery) ||
                  id.includes(normalizedQuery)
                );
              });
        return matches.slice(0, 8).map((candidate) => ({
          id: candidate.id,
          label: candidate.displayName,
        }));
      },
      render: createMentionSuggestionRenderer,
    },
  });
}
