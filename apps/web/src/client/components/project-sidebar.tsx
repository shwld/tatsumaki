import {
  PANEL_LABELS,
  PANEL_TYPES,
  type PanelType,
} from "../lib/panel-visibility";

type ProjectSidebarProps = {
  visibility: Record<PanelType, boolean>;
  onToggle: (panel: PanelType) => void;
};

export function ProjectSidebar({ visibility, onToggle }: ProjectSidebarProps) {
  return (
    <aside
      className="w-full shrink-0 border-b border-gray-200 bg-gray-50 p-3 md:min-h-0 md:w-48 md:border-r md:border-b-0"
      data-testid="project-sidebar"
    >
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Panels
      </h2>
      <ul className="flex flex-wrap gap-1 md:block md:space-y-1">
        {PANEL_TYPES.map((panel) => (
          <li key={panel}>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 md:flex md:bg-transparent md:px-2 md:py-1.5 md:text-sm">
              <input
                type="checkbox"
                checked={visibility[panel]}
                onChange={() => onToggle(panel)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                data-testid={`panel-toggle-${panel}`}
              />
              {PANEL_LABELS[panel]}
            </label>
          </li>
        ))}
      </ul>
    </aside>
  );
}
