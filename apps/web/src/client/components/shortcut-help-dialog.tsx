type ShortcutItem = {
  keyLabel: string;
  description: string;
};

type ShortcutHelpDialogProps = {
  open: boolean;
  items: ShortcutItem[];
  onClose: () => void;
};

export function ShortcutHelpDialog({
  open,
  items,
  onClose,
}: ShortcutHelpDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ショートカット一覧"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            キーボードショートカット
          </h2>
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={`${item.keyLabel}-${item.description}`}
              className="flex items-center justify-between gap-2 rounded border border-gray-200 px-3 py-2 text-sm"
            >
              <span className="text-gray-700">{item.description}</span>
              <kbd className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-800">
                {item.keyLabel}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
