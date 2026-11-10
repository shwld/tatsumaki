import { useParams } from "react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ActorLabel } from "../components/actor-label";
import { ProjectPage } from "../components/project-page";
import { useProjectBootstrap } from "../hooks/use-project-bootstrap";
import { useProjectHistory } from "../hooks/use-project-history";
import { userIdsEqual } from "../lib/user-ids-equal";
import { projectStoryEditPath } from "../lib/story-routes";
import type { ProjectMemberProfile } from "../types/project";
import type { ProjectHistoryEntry } from "../types/story";

function languageToLocale(language: string): string {
  return language === "en" ? "en-US" : "ja-JP";
}

function formatDate(isoString: string, language: string): string {
  return new Date(isoString).toLocaleString(languageToLocale(language), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActionLabel(entry: ProjectHistoryEntry, t: TFunction): string {
  switch (entry.action) {
    case "created":
      return t("projectHistoryScreen.actions.created");
    case "deleted":
      return t("projectHistoryScreen.actions.deleted");
    case "archived":
      return t("storyAccordion.subHeader.archive");
    case "unarchived":
      return t("storyAccordion.detail.restore");
    case "field_changed": {
      const knownFields = [
        "title",
        "description",
        "type",
        "status",
        "storyPoint",
        "labels",
        "story",
      ];
      const field = knownFields.includes(entry.fieldName)
        ? t(`projectHistoryScreen.fields.${entry.fieldName}`)
        : entry.fieldName;
      return t("projectHistoryScreen.actions.fieldChanged", { field });
    }
  }
}

function getChangeDescription(
  entry: ProjectHistoryEntry,
  t: TFunction,
): string {
  switch (entry.action) {
    case "created":
      return t("projectHistoryScreen.quoted", { value: entry.newValue ?? "" });
    case "deleted":
      return t("projectHistoryScreen.quoted", { value: entry.oldValue ?? "" });
    case "archived":
    case "unarchived":
      return "";
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
    case "archived":
    case "unarchived":
      return "bg-gray-100 text-gray-800";
    case "field_changed":
      return "bg-blue-100 text-blue-800";
  }
}

type HistoryEntryRowProps = {
  entry: ProjectHistoryEntry;
  projectId: string;
  members: ProjectMemberProfile[];
};

function HistoryEntryRow({ entry, projectId, members }: HistoryEntryRowProps) {
  const { t, i18n } = useTranslation();
  const storyTitle =
    entry.storyTitle ??
    (entry.action === "deleted" ? entry.oldValue : entry.newValue) ??
    entry.storyId;

  const member = members.find((m) => userIdsEqual(m.id, entry.actorUserId));

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
        {formatDate(entry.createdAt, i18n.language)}
      </td>
      <td className="max-w-[14rem] px-4 py-3 text-sm text-gray-700">
        <ActorLabel member={member} actorName={entry.actorName} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span
          className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${getActionBadgeColor(entry.action)}`}
        >
          {getActionLabel(entry, t)}
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
        {getChangeDescription(entry, t)}
      </td>
    </tr>
  );
}

export function ProjectHistoryScreen() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const { history, isLoading, error, hasMore, loadMore, isLoadingMore } =
    useProjectHistory(projectId ?? "");
  const { data: bootstrap } = useProjectBootstrap(projectId);
  const members = bootstrap?.memberOptions ?? [];

  return (
    <ProjectPage title={t("projectHistoryScreen.title")}>
      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">
          {t("projectHistoryScreen.loading")}
        </p>
      ) : history.length === 0 ? (
        <p className="text-sm text-gray-500">
          {t("projectHistoryScreen.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">
                    {t("projectHistoryScreen.columns.date")}
                  </th>
                  <th className="px-4 py-3">
                    {t("projectHistoryScreen.columns.actor")}
                  </th>
                  <th className="px-4 py-3">
                    {t("projectHistoryScreen.columns.action")}
                  </th>
                  <th className="px-4 py-3">
                    {t("projectHistoryScreen.columns.story")}
                  </th>
                  <th className="px-4 py-3">
                    {t("projectHistoryScreen.columns.change")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <HistoryEntryRow
                    key={entry.id}
                    entry={entry}
                    projectId={projectId ?? ""}
                    members={members}
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
              {isLoadingMore
                ? t("projectHistoryScreen.loading")
                : t("projectHistoryScreen.loadMore")}
            </button>
          ) : null}
        </div>
      )}
    </ProjectPage>
  );
}
