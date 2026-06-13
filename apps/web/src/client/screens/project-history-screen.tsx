import { useParams } from "react-router";
import { ProjectStoryBreadcrumb } from "../components/project-story-breadcrumb";
import { useProjectHistory } from "../hooks/use-project-history";
import { projectStoryEditPath } from "../lib/story-routes";
import type { ProjectHistoryEntry } from "../types/story";

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActionLabel(entry: ProjectHistoryEntry): string {
  switch (entry.action) {
    case "created":
      return "作成";
    case "deleted":
      return "削除";
    case "field_changed": {
      const fieldLabels: Record<string, string> = {
        title: "タイトル",
        description: "説明",
        type: "タイプ",
        status: "ステータス",
        storyPoint: "ポイント",
        labels: "ラベル",
        story: "ストーリー",
      };
      return `${fieldLabels[entry.fieldName] ?? entry.fieldName} を変更`;
    }
  }
}

function getChangeDescription(entry: ProjectHistoryEntry): string {
  switch (entry.action) {
    case "created":
      return `「${entry.newValue ?? ""}」`;
    case "deleted":
      return `「${entry.oldValue ?? ""}」`;
    case "field_changed":
      if (entry.oldValue !== null && entry.newValue !== null) {
        return `${entry.oldValue} → ${entry.newValue}`;
      }
      if (entry.newValue !== null) {
        return `→ ${entry.newValue}`;
      }
      if (entry.oldValue !== null) {
        return `${entry.oldValue} →`;
      }
      return "";
  }
}

function getActionBadgeColor(action: ProjectHistoryEntry["action"]): string {
  switch (action) {
    case "created":
      return "bg-green-100 text-green-800";
    case "deleted":
      return "bg-red-100 text-red-800";
    case "field_changed":
      return "bg-blue-100 text-blue-800";
  }
}

type HistoryEntryRowProps = {
  entry: ProjectHistoryEntry;
  projectId: string;
};

function HistoryEntryRow({ entry, projectId }: HistoryEntryRowProps) {
  const storyTitle =
    entry.storyTitle ??
    (entry.action === "deleted" ? entry.oldValue : entry.newValue) ??
    entry.storyId;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-500">
        {formatDate(entry.createdAt)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{entry.actorName}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getActionBadgeColor(entry.action)}`}
        >
          {getActionLabel(entry)}
        </span>
      </td>
      <td className="px-4 py-3 text-sm">
        {entry.action !== "deleted" && entry.storyId != null ? (
          <a
            href={projectStoryEditPath(projectId, entry.storyId)}
            className="font-medium text-blue-700 hover:underline"
          >
            {storyTitle}
          </a>
        ) : (
          <span className="text-gray-500 line-through">{storyTitle}</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {getChangeDescription(entry)}
      </td>
    </tr>
  );
}

export function ProjectHistoryScreen() {
  const { projectId } = useParams();
  const { history, isLoading, error, hasMore, loadMore, isLoadingMore } =
    useProjectHistory(projectId ?? "");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <ProjectStoryBreadcrumb
        projectId={projectId}
        currentPageLabel="Project History"
      />
      <h1 className="mb-6 text-xl font-semibold text-gray-900">
        Project History
      </h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-gray-500">まだ操作履歴がありません。</p>
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">日時</th>
                  <th className="px-4 py-3">操作者</th>
                  <th className="px-4 py-3">操作</th>
                  <th className="px-4 py-3">ストーリー</th>
                  <th className="px-4 py-3">変更内容</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <HistoryEntryRow
                    key={entry.id}
                    entry={entry}
                    projectId={projectId ?? ""}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {hasMore ? (
            <button
              type="button"
              className="text-sm font-medium text-blue-700 hover:text-blue-900 disabled:text-gray-400"
              disabled={isLoadingMore}
              onClick={() => {
                loadMore();
              }}
            >
              {isLoadingMore ? "読み込み中..." : "さらに表示"}
            </button>
          ) : null}
        </div>
      )}
    </main>
  );
}
