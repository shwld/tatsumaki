import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useOperationStart } from "../hooks/use-operation-start";
import { useProjectOperations } from "../hooks/use-project-operations";
import { ProjectAccessSummary } from "./project-access-summary";
import {
  OPERATION_BUTTON_CLASS,
  ProjectOperationControls,
} from "./project-operation-controls";

export function OwnedProjectUsage() {
  const { t } = useTranslation();
  const { state, reload } = useProjectOperations();
  const account = useOperationStart(reload);
  const [searchParams] = useSearchParams();

  return (
    <div className="space-y-2" data-testid="owned-project-usage">
      {searchParams.has("operation") ? (
        <p className="text-sm text-gray-600" role="status">
          {t("projectUsage.returned")}
        </p>
      ) : null}
      {state.status === "loading" ? (
        <p className="text-sm text-gray-600">{t("projectUsage.loading")}</p>
      ) : state.status === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600" role="alert">
            {t("projectUsage.error")}
          </p>
          <button
            type="button"
            className={OPERATION_BUTTON_CLASS}
            onClick={reload}
          >
            {t("projectUsage.retry")}
          </button>
        </div>
      ) : (
        <>
          {!state.list.operationsAvailable ? (
            <div className="space-y-2">
              <p className="text-sm text-red-600" role="alert">
                {t("projectUsage.operationsUnavailable")}
              </p>
              <button
                type="button"
                className={OPERATION_BUTTON_CLASS}
                onClick={reload}
              >
                {t("projectUsage.retry")}
              </button>
            </div>
          ) : null}
          {state.list.accountOperations.includes("manage") ? (
            <button
              type="button"
              className={OPERATION_BUTTON_CLASS}
              disabled={account.pending}
              onClick={() =>
                void account.start("/api/usage/account-operations/manage")
              }
            >
              {t("projectUsage.accountManage")}
            </button>
          ) : null}
          {account.failed ? (
            <p className="text-sm text-red-600" role="alert">
              {t("projectUsage.operationFailed")}
            </p>
          ) : null}
          <h3 className="text-sm font-semibold text-gray-900">
            {t("projectUsage.owned")}
          </h3>
          {state.list.projects.length === 0 ? (
            <p className="text-sm text-gray-600">{t("projectUsage.empty")}</p>
          ) : (
            <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
              {state.list.projects.map((project) => (
                <li
                  key={project.projectId}
                  className="space-y-1 px-4 py-3 text-sm text-gray-700"
                >
                  <p className="font-medium text-gray-900">
                    {project.projectName}
                  </p>
                  <ProjectAccessSummary access={project.access} />
                  <ProjectOperationControls
                    project={project}
                    from="account"
                    onFailed={reload}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
