import { useTranslation } from "react-i18next";
import { useOperationStart } from "../hooks/use-operation-start";
import type { OwnedProjectUsage } from "../../application/usecases/list-owned-project-usage";

export const OPERATION_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

/** Shows only the operations that were offered, plus the provider's notice. */
export function ProjectOperationControls({
  project,
  from,
  onFailed,
}: {
  project: OwnedProjectUsage;
  from: "account" | "settings";
  onFailed: () => void;
}) {
  const { t } = useTranslation();
  const { pending, failed, start } = useOperationStart(onFailed);

  return (
    <>
      {project.notice ? (
        <p>
          <a
            className="underline"
            href={project.notice.url}
            rel="noreferrer noopener"
          >
            {project.notice.text}
          </a>
        </p>
      ) : null}
      {project.operations.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {project.operations.map((operation) => (
            <button
              key={operation}
              type="button"
              className={OPERATION_BUTTON_CLASS}
              disabled={pending}
              aria-label={t("projectUsage.operationFor", {
                name: project.projectName,
                operation: t(`projectUsage.operation.${operation}`),
                interpolation: { escapeValue: false },
              })}
              onClick={() =>
                void start(
                  `/api/billing/projects/${encodeURIComponent(project.projectId)}/operations/${operation}?from=${from}`,
                )
              }
            >
              {t(`projectUsage.operation.${operation}`)}
            </button>
          ))}
        </div>
      ) : null}
      {failed ? (
        <p className="text-red-600" role="alert">
          {t("projectUsage.operationFailed")}
        </p>
      ) : null}
    </>
  );
}
