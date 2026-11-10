import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { ProjectPage } from "../components/project-page";
import { ProjectSection } from "../components/project-section";
import { useAuthError } from "../contexts/auth-error-context";
import { useToast } from "../contexts/toast-context";
import { isAuthError } from "../lib/api-error";
import {
  projectApiKeysPath,
  projectDeleteApiPath,
  projectApiPath,
  projectLabelsPath,
  projectPointScaleApiPath,
  projectSettingsApiPath,
} from "../lib/story-routes";
import { parseErrorMessage } from "../lib/parse-error-message";
import {
  ITERATION_START_DAYS,
  type IterationStartDay,
  POINT_SCALE_TYPES,
  type PointScaleType,
  type Project,
  SPRINT_DURATION_OPTIONS,
  type SprintDuration,
  TIMEZONE_OPTIONS,
} from "../types/project";

export function ProjectSettingsScreen() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { notifySessionExpired } = useAuthError();
  const { showToast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [nameInput, setNameInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [isPublicInput, setIsPublicInput] = useState(false);
  const [timezoneInput, setTimezoneInput] = useState("Asia/Tokyo");
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  const [pointScaleType, setPointScaleType] =
    useState<PointScaleType>("fibonacci");
  const [customScaleInput, setCustomScaleInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingEstimate, setIsSavingEstimate] = useState(false);
  const [isSavingIteration, setIsSavingIteration] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [confirmProjectName, setConfirmProjectName] = useState("");
  const [sprintDurationInput, setSprintDurationInput] =
    useState<SprintDuration>(14);
  const [iterationStartDayInput, setIterationStartDayInput] =
    useState<IterationStartDay>(1);

  useEffect(() => {
    if (!projectId) return;

    const fetchProject = async () => {
      try {
        const response = await fetch(projectApiPath(projectId));
        if (response.status === 401) {
          notifySessionExpired();
          return;
        }
        if (!response.ok) {
          setLoadFailed(true);
          return;
        }
        const data = (await response.json()) as { project: Project };
        setProject(data.project);
        setNameInput(data.project.name);
        setDescriptionInput(data.project.description);
        setIsPublicInput(data.project.isPublic);
        setTimezoneInput(data.project.timezone);
        setSprintDurationInput(data.project.sprintDurationDays);
        setIterationStartDayInput(data.project.iterationStartDay);
        setPointScaleType(data.project.pointScaleType);
        if (data.project.customPointScale) {
          setCustomScaleInput(data.project.customPointScale.join(", "));
        }
      } catch {
        setLoadFailed(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [projectId, notifySessionExpired]);

  const handleGeneralSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!projectId || isSavingGeneral) return;

      const trimmedName = nameInput.trim();
      if (trimmedName.length === 0) {
        showToast("error", t("projectSettingsScreen.toast.nameRequired"));
        return;
      }

      setIsSavingGeneral(true);

      try {
        const response = await fetch(projectSettingsApiPath(projectId), {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            description: descriptionInput,
            isPublic: isPublicInput,
            timezone: timezoneInput,
          }),
        });

        if (isAuthError(response.status)) {
          notifySessionExpired();
          return;
        }

        if (!response.ok) {
          const errorMessage = await parseErrorMessage(response);
          showToast(
            "error",
            errorMessage ?? t("projectSettingsScreen.toast.updateFailed"),
          );
          return;
        }

        const data = (await response.json()) as { project?: Project };
        if (data.project) {
          setProject(data.project);
        }
        showToast("success", t("projectSettingsScreen.toast.projectUpdated"));
      } catch {
        showToast("error", t("projectSettingsScreen.toast.updateFailed"));
      } finally {
        setIsSavingGeneral(false);
      }
    },
    [
      projectId,
      isSavingGeneral,
      nameInput,
      descriptionInput,
      isPublicInput,
      timezoneInput,
      notifySessionExpired,
      showToast,
      t,
    ],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId) return;

    setIsSaving(true);
    setError(null);

    try {
      let customPointScale: number[] | null = null;
      if (pointScaleType === "custom") {
        const parsed = customScaleInput
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== "")
          .map(Number);

        if (
          parsed.length === 0 ||
          parsed.some((n) => !Number.isInteger(n) || n < 0)
        ) {
          setError(t("projectSettingsScreen.pointScale.customInvalid"));
          setIsSaving(false);
          return;
        }
        customPointScale = [...new Set(parsed)].sort((a, b) => a - b);
      }

      const response = await fetch(projectPointScaleApiPath(projectId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pointScaleType, customPointScale }),
      });

      if (response.status === 401) {
        notifySessionExpired();
        return;
      }

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? t("projectSettingsScreen.saveFailed"));
        return;
      }

      const data = (await response.json()) as { project: Project };
      setProject(data.project);
      showToast("success", t("projectSettingsScreen.toast.pointScaleUpdated"));
    } catch {
      setError(t("projectSettingsScreen.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEstimateToggle = async (
    field: "estimateBugs" | "estimateChores",
    value: boolean,
  ) => {
    if (!projectId || isSavingEstimate) return;

    setIsSavingEstimate(true);

    try {
      const response = await fetch(projectSettingsApiPath(projectId), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });

      if (isAuthError(response.status)) {
        notifySessionExpired();
        return;
      }

      if (!response.ok) {
        const errorMessage = await parseErrorMessage(response);
        showToast(
          "error",
          errorMessage ?? t("projectSettingsScreen.toast.updateFailed"),
        );
        return;
      }

      const data = (await response.json()) as { project?: Project };
      if (data.project) {
        setProject(data.project);
      }
      showToast("success", t("projectSettingsScreen.toast.settingsUpdated"));
    } catch {
      showToast("error", t("projectSettingsScreen.toast.updateFailed"));
    } finally {
      setIsSavingEstimate(false);
    }
  };

  const handleIterationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || isSavingIteration || !project) return;

    const hasChanged =
      project.sprintDurationDays !== sprintDurationInput ||
      project.iterationStartDay !== iterationStartDayInput;
    if (!hasChanged) {
      showToast("success", t("projectSettingsScreen.toast.noChanges"));
      return;
    }

    setIsSavingIteration(true);

    try {
      const response = await fetch(projectSettingsApiPath(projectId), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sprintDurationDays: sprintDurationInput,
          iterationStartDay: iterationStartDayInput,
        }),
      });

      if (isAuthError(response.status)) {
        notifySessionExpired();
        return;
      }

      if (!response.ok) {
        const errorMessage = await parseErrorMessage(response);
        showToast(
          "error",
          errorMessage ?? t("projectSettingsScreen.toast.updateFailed"),
        );
        return;
      }

      const data = (await response.json()) as { project?: Project };
      if (data.project) {
        setProject(data.project);
        setSprintDurationInput(data.project.sprintDurationDays);
        setIterationStartDayInput(data.project.iterationStartDay);
      }
      showToast("success", t("projectSettingsScreen.toast.iterationUpdated"));
    } catch {
      showToast("error", t("projectSettingsScreen.toast.updateFailed"));
    } finally {
      setIsSavingIteration(false);
    }
  };

  const handleDeleteProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !project || isDeletingProject) return;

    if (confirmProjectName !== project.name) {
      showToast("error", t("projectSettingsScreen.toast.deleteNameMismatch"));
      return;
    }

    setIsDeletingProject(true);
    try {
      const response = await fetch(projectDeleteApiPath(projectId), {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmProjectName }),
      });

      if (isAuthError(response.status)) {
        notifySessionExpired();
        return;
      }

      if (!response.ok) {
        const data = (await response.json()) as {
          code?: string;
          error?: string;
        };
        if (response.status === 400 && data.code === "project_name_mismatch") {
          showToast(
            "error",
            t("projectSettingsScreen.toast.deleteNameMismatch"),
          );
          return;
        }
        if (response.status === 403) {
          showToast("error", t("projectSettingsScreen.toast.deleteForbidden"));
          return;
        }
        if (response.status === 404) {
          showToast("error", t("projectSettingsScreen.toast.deleteNotFound"));
          return;
        }
        showToast("error", t("projectSettingsScreen.toast.deleteFailed"));
        return;
      }

      showToast("success", t("projectSettingsScreen.toast.deleted"));
      void navigate("/projects");
    } catch {
      showToast("error", t("projectSettingsScreen.toast.deleteFailed"));
    } finally {
      setIsDeletingProject(false);
    }
  };

  if (isLoading) {
    return (
      <p className="p-4 text-gray-500">{t("projectSettingsScreen.loading")}</p>
    );
  }

  if (loadFailed && !project) {
    return (
      <p className="p-4 text-red-600">{t("projectSettingsScreen.loadError")}</p>
    );
  }

  const isOwner = project?.currentUserRole === "owner";

  return (
    <ProjectPage title={t("projectSettingsScreen.title")}>
      <div className="space-y-6">
        {project ? (
          <ProjectSection title={t("projectSettingsScreen.general.title")}>
            <form onSubmit={handleGeneralSubmit} className="mt-3 space-y-4">
              <fieldset>
                <legend className="sr-only">
                  {t("projectSettingsScreen.general.title")}
                </legend>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="projectName"
                      className="block text-sm font-medium text-gray-700"
                    >
                      {t("projectSettingsScreen.general.name")}
                    </label>
                    <input
                      id="projectName"
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      disabled={!isOwner}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="projectDescription"
                      className="block text-sm font-medium text-gray-700"
                    >
                      {t("projectSettingsScreen.general.description")}
                    </label>
                    <textarea
                      id="projectDescription"
                      value={descriptionInput}
                      onChange={(e) => setDescriptionInput(e.target.value)}
                      disabled={!isOwner}
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                    />
                  </div>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={isPublicInput}
                      disabled={!isOwner}
                      onChange={(e) => setIsPublicInput(e.target.checked)}
                    />
                    <span className="text-sm text-gray-700">
                      {t("projectSettingsScreen.general.isPublic")}
                    </span>
                  </label>

                  <div>
                    <label
                      htmlFor="projectTimezone"
                      className="block text-sm font-medium text-gray-700"
                    >
                      {t("projectSettingsScreen.general.timezone")}
                    </label>
                    <select
                      id="projectTimezone"
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                      value={timezoneInput}
                      disabled={!isOwner}
                      onChange={(e) => setTimezoneInput(e.target.value)}
                    >
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </fieldset>

              {isOwner && (
                <button
                  type="submit"
                  disabled={isSavingGeneral}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSavingGeneral
                    ? t("projectSettingsScreen.saving")
                    : t("projectSettingsScreen.save")}
                </button>
              )}

              {!isOwner && (
                <p className="text-xs text-gray-500">
                  {t("projectSettingsScreen.ownerRequired")}
                </p>
              )}
            </form>
          </ProjectSection>
        ) : null}

        <ProjectSection title={t("projectSettingsScreen.pointScale.title")}>
          <form onSubmit={handleSubmit} className="mt-3 space-y-6">
            <fieldset>
              <legend className="sr-only">
                {t("projectSettingsScreen.pointScale.title")}
              </legend>
              <div className="space-y-2">
                {POINT_SCALE_TYPES.map((scaleType) => (
                  <label key={scaleType} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="pointScaleType"
                      value={scaleType}
                      checked={pointScaleType === scaleType}
                      onChange={() => setPointScaleType(scaleType)}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700">
                      {t(`projectSettingsScreen.pointScale.types.${scaleType}`)}
                    </span>
                  </label>
                ))}
              </div>

              {pointScaleType === "custom" ? (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700">
                    {t("projectSettingsScreen.pointScale.customValues")}
                    <input
                      type="text"
                      value={customScaleInput}
                      onChange={(e) => setCustomScaleInput(e.target.value)}
                      placeholder="0, 1, 2, 3, 5, 8, 13"
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              ) : null}
            </fieldset>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving
                ? t("projectSettingsScreen.saving")
                : t("projectSettingsScreen.save")}
            </button>
          </form>
        </ProjectSection>

        {project ? (
          <ProjectSection title={t("projectSettingsScreen.estimate.title")}>
            <p className="mb-4 text-sm text-gray-600">
              {t("projectSettingsScreen.estimate.description")}
            </p>

            <div className="space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={project.estimateBugs}
                  disabled={isSavingEstimate || !isOwner}
                  onChange={(e) =>
                    handleEstimateToggle("estimateBugs", e.target.checked)
                  }
                />
                <span className="text-sm text-gray-700">
                  {t("projectSettingsScreen.estimate.bugs")}
                </span>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={project.estimateChores}
                  disabled={isSavingEstimate || !isOwner}
                  onChange={(e) =>
                    handleEstimateToggle("estimateChores", e.target.checked)
                  }
                />
                <span className="text-sm text-gray-700">
                  {t("projectSettingsScreen.estimate.chores")}
                </span>
              </label>
            </div>

            {!isOwner && (
              <p className="mt-3 text-xs text-gray-500">
                {t("projectSettingsScreen.ownerRequired")}
              </p>
            )}
          </ProjectSection>
        ) : null}

        {project ? (
          <ProjectSection title={t("projectSettingsScreen.iteration.title")}>
            <p className="mb-4 text-sm text-gray-600">
              {t("projectSettingsScreen.iteration.description")}
            </p>
            <form onSubmit={handleIterationSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="sprintDuration"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t("projectSettingsScreen.iteration.length")}
                </label>
                <select
                  id="sprintDuration"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={sprintDurationInput}
                  disabled={isSavingIteration || !isOwner}
                  onChange={(e) =>
                    setSprintDurationInput(
                      Number(e.target.value) as SprintDuration,
                    )
                  }
                >
                  {SPRINT_DURATION_OPTIONS.map((days) => (
                    <option key={days} value={days}>
                      {t(`projectSettingsScreen.iteration.durations.${days}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="iterationStartDay"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t("projectSettingsScreen.iteration.startDay")}
                </label>
                <select
                  id="iterationStartDay"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={iterationStartDayInput}
                  disabled={isSavingIteration || !isOwner}
                  onChange={(e) =>
                    setIterationStartDayInput(
                      Number(e.target.value) as IterationStartDay,
                    )
                  }
                >
                  {ITERATION_START_DAYS.map((day) => (
                    <option key={day} value={day}>
                      {t(`projectSettingsScreen.iteration.days.${day}`)}
                    </option>
                  ))}
                </select>
              </div>

              {isOwner ? (
                <button
                  type="submit"
                  disabled={isSavingIteration}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSavingIteration
                    ? t("projectSettingsScreen.iteration.recalculating")
                    : t("projectSettingsScreen.save")}
                </button>
              ) : null}
            </form>

            {!isOwner && (
              <p className="mt-3 text-xs text-gray-500">
                {t("projectSettingsScreen.ownerRequired")}
              </p>
            )}
          </ProjectSection>
        ) : null}

        {projectId ? (
          <ProjectSection title={t("projectSettingsScreen.labels.title")}>
            <p className="mb-3 text-sm text-gray-600">
              {t("projectSettingsScreen.labels.description")}
            </p>
            <Link
              to={projectLabelsPath(projectId)}
              className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t("projectSettingsScreen.labels.open")}
            </Link>
          </ProjectSection>
        ) : null}

        {projectId && isOwner ? (
          <ProjectSection title={t("projectSettingsScreen.apiKeys.title")}>
            <p className="mb-3 text-sm text-gray-600">
              {t("projectSettingsScreen.apiKeys.description")}
            </p>
            <Link
              to={projectApiKeysPath(projectId)}
              className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t("projectSettingsScreen.apiKeys.open")}
            </Link>
          </ProjectSection>
        ) : null}

        {project && projectId && isOwner ? (
          <ProjectSection
            title={t("projectSettingsScreen.danger.title")}
            tone="danger"
          >
            <p className="mb-3 text-sm text-red-800">
              {t("projectSettingsScreen.danger.description")}
            </p>
            <form onSubmit={handleDeleteProject} className="space-y-3">
              <label
                htmlFor="confirmProjectName"
                className="block text-sm font-medium text-red-900"
              >
                {t("projectSettingsScreen.danger.confirmName")}
              </label>
              <input
                id="confirmProjectName"
                type="text"
                value={confirmProjectName}
                onChange={(event) => setConfirmProjectName(event.target.value)}
                placeholder={project.name}
                disabled={isDeletingProject}
                className="block w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-red-900"
              />
              <button
                type="submit"
                disabled={
                  isDeletingProject || confirmProjectName !== project.name
                }
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {isDeletingProject
                  ? t("projectSettingsScreen.danger.deleting")
                  : t("projectSettingsScreen.danger.delete")}
              </button>
            </form>
          </ProjectSection>
        ) : null}
      </div>
    </ProjectPage>
  );
}
