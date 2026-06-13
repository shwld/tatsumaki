import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { ProjectStoryBreadcrumb } from "../components/project-story-breadcrumb";
import { useAuthError } from "../contexts/auth-error-context";
import { useToast } from "../contexts/toast-context";
import { isAuthError } from "../lib/api-error";
import {
  projectApiKeysPath,
  projectDeleteApiPath,
  projectApiPath,
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

const POINT_SCALE_LABELS: Record<PointScaleType, string> = {
  fibonacci: "フィボナッチ (0, 1, 2, 3, 5, 8, 13)",
  linear: "リニア (0, 1, 2, 3, 4, 5)",
  powers_of_2: "2のべき乗 (0, 1, 2, 4, 8, 16)",
  custom: "カスタム",
};

const SPRINT_DURATION_LABELS: Record<SprintDuration, string> = {
  7: "1週間",
  14: "2週間",
  21: "3週間",
  28: "4週間",
};

const ITERATION_START_DAY_LABELS: Record<IterationStartDay, string> = {
  0: "日曜日",
  1: "月曜日",
  2: "火曜日",
  3: "水曜日",
  4: "木曜日",
  5: "金曜日",
  6: "土曜日",
};

export function ProjectSettingsScreen() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { notifySessionExpired } = useAuthError();
  const { showToast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setError("プロジェクトの読み込みに失敗しました");
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
        setError("プロジェクトの読み込みに失敗しました");
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
        showToast("error", "プロジェクト名は必須です");
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
          showToast("error", errorMessage ?? "設定の更新に失敗しました");
          return;
        }

        const data = (await response.json()) as { project?: Project };
        if (data.project) {
          setProject(data.project);
        }
        showToast("success", "プロジェクト設定を更新しました");
      } catch {
        showToast("error", "設定の更新に失敗しました");
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
          setError(
            "カスタムスケールは0以上の整数をカンマ区切りで入力してください",
          );
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
        setError(data.error ?? "保存に失敗しました");
        return;
      }

      const data = (await response.json()) as { project: Project };
      setProject(data.project);
      showToast("success", "ポイントスケールを更新しました");
    } catch {
      setError("保存に失敗しました");
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
        showToast("error", errorMessage ?? "設定の更新に失敗しました");
        return;
      }

      const data = (await response.json()) as { project?: Project };
      if (data.project) {
        setProject(data.project);
      }
      showToast("success", "設定を更新しました");
    } catch {
      showToast("error", "設定の更新に失敗しました");
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
      showToast("success", "変更はありません");
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
        showToast("error", errorMessage ?? "設定の更新に失敗しました");
        return;
      }

      const data = (await response.json()) as { project?: Project };
      if (data.project) {
        setProject(data.project);
        setSprintDurationInput(data.project.sprintDurationDays);
        setIterationStartDayInput(data.project.iterationStartDay);
      }
      showToast("success", "イテレーション設定を更新しました");
    } catch {
      showToast("error", "設定の更新に失敗しました");
    } finally {
      setIsSavingIteration(false);
    }
  };

  const handleDeleteProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !project || isDeletingProject) return;

    if (confirmProjectName !== project.name) {
      showToast("error", "確認用のプロジェクト名が一致しません");
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
          showToast("error", "確認用のプロジェクト名が一致しません");
          return;
        }
        if (response.status === 403) {
          showToast(
            "error",
            "プロジェクトを削除する権限がありません。オーナーに依頼してください。",
          );
          return;
        }
        if (response.status === 404) {
          showToast(
            "error",
            "対象プロジェクトが見つかりません。既に削除されている可能性があります。",
          );
          return;
        }
        showToast("error", "プロジェクトの削除に失敗しました");
        return;
      }

      showToast("success", "プロジェクトを削除しました");
      void navigate("/projects");
    } catch {
      showToast("error", "プロジェクトの削除に失敗しました");
    } finally {
      setIsDeletingProject(false);
    }
  };

  if (isLoading) {
    return <p className="p-4 text-gray-500">読み込み中...</p>;
  }

  if (error && !project) {
    return <p className="p-4 text-red-600">{error}</p>;
  }

  const isOwner = project?.currentUserRole === "owner";

  return (
    <div className="mx-auto max-w-2xl p-4">
      {projectId ? (
        <ProjectStoryBreadcrumb projectId={projectId} currentPageLabel="設定" />
      ) : null}
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        プロジェクト設定
      </h1>

      {project ? (
        <form onSubmit={handleGeneralSubmit} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-lg font-semibold text-gray-800">
              基本設定
            </legend>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="projectName"
                  className="block text-sm font-medium text-gray-700"
                >
                  プロジェクト名
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
                  説明
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
                  プロジェクトを公開する
                </span>
              </label>

              <div>
                <label
                  htmlFor="projectTimezone"
                  className="block text-sm font-medium text-gray-700"
                >
                  タイムゾーン
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
              {isSavingGeneral ? "保存中..." : "保存"}
            </button>
          )}

          {!isOwner && (
            <p className="text-xs text-gray-500">
              設定を変更するにはオーナー権限が必要です。
            </p>
          )}
        </form>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <fieldset>
          <legend className="mb-2 text-lg font-semibold text-gray-800">
            ポイントスケール
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
                  {POINT_SCALE_LABELS[scaleType]}
                </span>
              </label>
            ))}
          </div>

          {pointScaleType === "custom" ? (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700">
                カスタム値（カンマ区切り）
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
          {isSaving ? "保存中..." : "保存"}
        </button>
      </form>

      {project ? (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold text-gray-800">
            見積もり設定
          </h2>
          <p className="mb-4 text-sm text-gray-600">
            Bug・Choreタイプのストーリーにポイント見積もりを付けるかどうかを設定します。
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
                Bugの見積もりを有効にする
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
                Choreの見積もりを有効にする
              </span>
            </label>
          </div>

          {!isOwner && (
            <p className="mt-3 text-xs text-gray-500">
              設定を変更するにはオーナー権限が必要です。
            </p>
          )}
        </section>
      ) : null}

      {project ? (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold text-gray-800">
            イテレーション設定
          </h2>
          <p className="mb-4 text-sm text-gray-600">
            スプリントの長さと開始曜日を設定します。保存後に再計算が完了すると反映されます。
          </p>
          <form onSubmit={handleIterationSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="sprintDuration"
                className="block text-sm font-medium text-gray-700"
              >
                イテレーション長
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
                    {SPRINT_DURATION_LABELS[days]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="iterationStartDay"
                className="block text-sm font-medium text-gray-700"
              >
                開始曜日
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
                    {ITERATION_START_DAY_LABELS[day]}
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
                {isSavingIteration ? "再計算中..." : "保存"}
              </button>
            ) : null}
          </form>

          {!isOwner && (
            <p className="mt-3 text-xs text-gray-500">
              設定を変更するにはオーナー権限が必要です。
            </p>
          )}
        </section>
      ) : null}

      {projectId && isOwner ? (
        <section className="mt-8 rounded-md border border-gray-200 p-4">
          <h2 className="mb-2 text-lg font-semibold text-gray-800">
            APIキー管理
          </h2>
          <p className="mb-3 text-sm text-gray-600">
            CLI や外部ツール向けの API キーを発行・失効します。
          </p>
          <Link
            to={projectApiKeysPath(projectId)}
            className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            APIキー管理を開く
          </Link>
        </section>
      ) : null}

      {project && projectId && isOwner ? (
        <section className="mt-8 rounded-md border border-red-200 bg-red-50 p-4">
          <h2 className="mb-2 text-lg font-semibold text-red-900">
            危険操作: プロジェクト削除
          </h2>
          <p className="mb-3 text-sm text-red-800">
            この操作は取り消せません。削除するにはプロジェクト名を正確に入力してください。
          </p>
          <form onSubmit={handleDeleteProject} className="space-y-3">
            <label
              htmlFor="confirmProjectName"
              className="block text-sm font-medium text-red-900"
            >
              確認用プロジェクト名
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
              {isDeletingProject ? "削除中..." : "プロジェクトを削除する"}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
