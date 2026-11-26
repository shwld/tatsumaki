import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useProjectOperations } from "../hooks/use-project-operations";
import { useUsageMode } from "../hooks/use-usage-mode";
import { ProjectAccessSummary } from "./project-access-summary";
import {
  OPERATION_BUTTON_CLASS,
  ProjectOperationControls,
} from "./project-operation-controls";
import { ProjectSection } from "./project-section";

/** owner 専用。セルフホストでは何も描画しない。 */
export function ProjectUsageSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const mode = useUsageMode();
  const { state, reload } = useProjectOperations(mode === "control-plane");
  const [searchParams] = useSearchParams();

  if (mode === "self-hosted") return null;

  const failed =
    mode === "unavailable" ||
    state.status === "error" ||
    (state.status === "ready" && !state.list.operationsAvailable);
  const project =
    state.status === "ready"
      ? state.list.projects.find((entry) => entry.projectId === projectId)
      : undefined;

  return (
    <ProjectSection title={t("projectUsage.title")}>
      <div
        className="space-y-1 text-sm text-gray-700"
        data-testid="project-usage-section"
      >
        {searchParams.has("operation") ? (
          <p className="text-gray-600" role="status">
            {t("projectUsage.returned")}
          </p>
        ) : null}
        {state.status === "loading" && mode !== "unavailable" ? (
          <p className="text-gray-600">{t("projectUsage.loading")}</p>
        ) : null}
        {project ? (
          <>
            <ProjectAccessSummary access={project.access} />
            <ProjectOperationControls
              project={project}
              from="settings"
              onFailed={reload}
            />
          </>
        ) : null}
        {failed ? (
          <div className="space-y-2">
            <p className="text-red-600" role="alert">
              {t(
                state.status === "ready"
                  ? "projectUsage.operationsUnavailable"
                  : "projectUsage.error",
              )}
            </p>
            {mode === "unavailable" ? null : (
              <button
                type="button"
                className={OPERATION_BUTTON_CLASS}
                onClick={reload}
              >
                {t("projectUsage.retry")}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </ProjectSection>
  );
}
