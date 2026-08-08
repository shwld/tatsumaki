import { STORY_STATUS_LABELS } from "./story-status";
import type {
  StoryStatus,
  StoryTimelineEntry,
  StoryTimelineField,
} from "../types/story";

const TIMELINE_FIELD_LABELS: Record<StoryTimelineField, string> = {
  title: "タイトル",
  description: "説明",
  type: "種別",
  status: "ステータス",
  storyPoint: "ポイント",
  labels: "ラベル",
  story: "ストーリー",
};

const TIMELINE_FIELD_LABELS_EN: Record<StoryTimelineField, string> = {
  title: "Title",
  description: "Description",
  type: "Type",
  status: "Status",
  storyPoint: "Points",
  labels: "Labels",
  story: "Story",
};

const STORY_STATUS_LABELS_EN: Record<StoryStatus, string> = {
  Unstarted: "Unstarted",
  Started: "Started",
  Finished: "Finished",
  Delivered: "Delivered",
  Accepted: "Accepted",
  Rejected: "Rejected",
};

function formatTimelineValue(
  fieldName: StoryTimelineField,
  value: string | null,
  english: boolean,
): string {
  if (fieldName === "status" && value !== null) {
    return english
      ? STORY_STATUS_LABELS_EN[value as StoryStatus]
      : STORY_STATUS_LABELS[value as StoryStatus];
  }

  if (fieldName === "storyPoint") {
    return value ?? (english ? "Unset" : "未設定");
  }

  if (fieldName === "labels") {
    if (!value) {
      return english ? "None" : "なし";
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.join(", ") || (english ? "None" : "なし");
      }
    } catch {
      return value;
    }
  }

  return value ?? (english ? "Unset" : "未設定");
}

export function formatStoryTimelineSummary(
  entry: StoryTimelineEntry,
  locale = "ja-JP",
): string {
  const english = locale.startsWith("en");
  if (entry.entryType === "comment") {
    return english ? "Posted a comment" : "コメントを投稿";
  }

  if (entry.action === "created") {
    return english ? "Created the story" : "ストーリーを作成";
  }
  if (entry.action === "deleted") {
    return english ? "Deleted the story" : "ストーリーを削除";
  }

  const fieldLabel = english
    ? TIMELINE_FIELD_LABELS_EN[entry.fieldName]
    : TIMELINE_FIELD_LABELS[entry.fieldName];
  const oldValue = formatTimelineValue(
    entry.fieldName,
    entry.oldValue,
    english,
  );
  const newValue = formatTimelineValue(
    entry.fieldName,
    entry.newValue,
    english,
  );

  return english
    ? `Changed ${fieldLabel} from ${oldValue} to ${newValue}`
    : `${fieldLabel}を${oldValue}から${newValue}に変更`;
}

export function formatAttachmentFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageAttachmentMime(mimeType: string): boolean {
  return mimeType.trim().toLowerCase().startsWith("image/");
}
