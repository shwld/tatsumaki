import type { FormEvent } from "react";
import {
  formatAttachmentFileSize,
  isImageAttachmentMime,
} from "../lib/story-timeline-ui";
import { projectStoryAttachmentContentApiPath } from "../lib/story-routes";
import type { StoryAttachment } from "../types/story";

export type StoryAccordionAttachmentsSectionProps = {
  storyId: string;
  projectId: string;
  attachments: StoryAttachment[];
  attachmentsError: string | null;
  isAttachmentsLoading: boolean;
  selectedAttachmentFile: File | null;
  onAttachmentFileChange: (file: File | null) => void;
  isUploadingAttachment: boolean;
  onUploadSubmit: (event: FormEvent<HTMLFormElement>) => void;
  deletingAttachmentId: string | null;
  onDeleteAttachment: (attachmentId: string) => void;
};

export function StoryAccordionAttachmentsSection({
  storyId,
  projectId,
  attachments,
  attachmentsError,
  isAttachmentsLoading,
  selectedAttachmentFile,
  onAttachmentFileChange,
  isUploadingAttachment,
  onUploadSubmit,
  deletingAttachmentId,
  onDeleteAttachment,
}: StoryAccordionAttachmentsSectionProps) {
  return (
    <section aria-labelledby={`story-attachments-${storyId}`}>
      <h4
        id={`story-attachments-${storyId}`}
        className="text-xs font-semibold text-gray-700 dark:text-slate-200"
      >
        添付ファイル
      </h4>
      <form
        className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 dark:border-slate-700 dark:bg-slate-900/60"
        onSubmit={(e) => {
          void onUploadSubmit(e);
        }}
      >
        <input
          id={`story-attachment-${storyId}`}
          className="mt-1 block w-full text-xs"
          type="file"
          onChange={(event) => {
            onAttachmentFileChange(event.target.files?.[0] ?? null);
          }}
        />
        <button
          type="submit"
          className="mt-2 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white disabled:bg-gray-300 dark:bg-blue-500 dark:hover:bg-blue-400 dark:disabled:bg-slate-600"
          disabled={!selectedAttachmentFile || isUploadingAttachment}
        >
          {isUploadingAttachment ? "アップロード中..." : "アップロード"}
        </button>
      </form>
      {attachmentsError ? (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {attachmentsError}
        </p>
      ) : null}
      {isAttachmentsLoading ? (
        <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
          読み込み中...
        </p>
      ) : null}
      {!isAttachmentsLoading && attachments.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
          添付ファイルはまだありません。
        </p>
      ) : null}
      {attachments.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {attachments.map((attachment) => {
            const contentPath = projectStoryAttachmentContentApiPath(
              projectId,
              storyId,
              attachment.id,
            );
            return (
              <li
                key={attachment.id}
                className="rounded border border-gray-200 bg-gray-50 p-2 dark:border-slate-700 dark:bg-slate-900/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-xs font-medium text-gray-900 dark:text-slate-100">
                    {attachment.fileName}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400">
                    {formatAttachmentFileSize(attachment.fileSize)}
                  </span>
                </div>
                {isImageAttachmentMime(attachment.mimeType) ? (
                  <img
                    className="mt-2 max-h-40 w-auto rounded border border-gray-200 object-contain"
                    src={contentPath}
                    alt=""
                    loading="lazy"
                  />
                ) : null}
                <div className="mt-2 flex gap-2">
                  <a
                    href={`${contentPath}?download=1`}
                    className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    ダウンロード
                  </a>
                  <button
                    type="button"
                    className="text-xs font-medium text-red-700 disabled:opacity-50"
                    disabled={deletingAttachmentId === attachment.id}
                    onClick={() => {
                      void onDeleteAttachment(attachment.id);
                    }}
                  >
                    {deletingAttachmentId === attachment.id
                      ? "削除中..."
                      : "削除"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
