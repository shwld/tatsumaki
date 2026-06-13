import type { ThemeMode } from "../hooks/use-theme";

type ThemeToggleProps = {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
};

export function ThemeToggle({ value, onChange }: ThemeToggleProps) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-[var(--color-muted)]">
      <span>Theme</span>
      <select
        aria-label="Theme mode"
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)]"
        value={value}
        onChange={(event) => onChange(event.target.value as ThemeMode)}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
