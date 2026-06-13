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

function formatTimelineValue(
  fieldName: StoryTimelineField,
  value: string | null,
): string {
  if (fieldName === "status" && value !== null) {
    return STORY_STATUS_LABELS[value as StoryStatus];
  }

  if (fieldName === "storyPoint") {
    return value ?? "未設定";
  }

  if (fieldName === "labels") {
    if (!value) {
      return "なし";
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.join(", ") || "なし";
      }
    } catch {
      return value;
    }
  }

  return value ?? "未設定";
}

export function formatStoryTimelineSummary(entry: StoryTimelineEntry): string {
  if (entry.entryType === "comment") {
    return "コメントを投稿";
  }

  if (entry.action === "created") {
    return "ストーリーを作成";
  }
  if (entry.action === "deleted") {
    return "ストーリーを削除";
  }

  const fieldLabel = TIMELINE_FIELD_LABELS[entry.fieldName];
  const oldValue = formatTimelineValue(entry.fieldName, entry.oldValue);
  const newValue = formatTimelineValue(entry.fieldName, entry.newValue);

  return `${fieldLabel}を${oldValue}から${newValue}に変更`;
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
