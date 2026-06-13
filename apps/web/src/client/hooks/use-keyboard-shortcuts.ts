import { useEffect } from "react";

export type KeyboardShortcut = {
  key: string;
  description: string;
  action: (event: KeyboardEvent) => void;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  allowInInput?: boolean;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    Boolean(target.closest("[contenteditable='true']"))
  );
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        if (!shortcut.allowInInput && isEditableTarget(event.target)) {
          continue;
        }
        if (shortcut.key.toLowerCase() !== event.key.toLowerCase()) {
          continue;
        }
        if (Boolean(shortcut.meta) !== event.metaKey) {
          continue;
        }
        if (Boolean(shortcut.ctrl) !== event.ctrlKey) {
          continue;
        }
        if (Boolean(shortcut.shift) !== event.shiftKey) {
          continue;
        }
        if (Boolean(shortcut.alt) !== event.altKey) {
          continue;
        }
        shortcut.action(event);
        break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shortcuts]);
}
