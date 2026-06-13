import { useCallback, useEffect, useRef, useState } from "react";
import { RichTextEditor } from "./rich-text-editor";
import type { ProjectMemberProfile } from "../types/project";
import { convertLegacyMentionsToMentionLinks } from "../lib/mention-markdown";

type EditableMarkdownProps = {
  value: string;
  onSave: (value: string) => void;
  mentionCandidates?: ProjectMemberProfile[];
  placeholder?: string;
  uploadPastedImage?: (file: File) => Promise<string | null>;
};

export function EditableMarkdown({
  value,
  onSave,
  mentionCandidates = [],
  placeholder = "入力してください...",
  uploadPastedImage,
}: EditableMarkdownProps) {
  const normalizeMentions = useCallback(
    (nextValue: string) =>
      convertLegacyMentionsToMentionLinks(nextValue, mentionCandidates),
    [mentionCandidates],
  );
  const [draft, setDraft] = useState(() => normalizeMentions(value));
  const editorContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(normalizeMentions(value));
  }, [normalizeMentions, value]);

  const save = useCallback(() => {
    const normalizedValue = normalizeMentions(value);
    if (draft !== normalizedValue) {
      onSave(draft);
    }
  }, [draft, normalizeMentions, onSave, value]);

  const cancel = useCallback(() => {
    setDraft(normalizeMentions(value));
  }, [normalizeMentions, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        save();
      }
    },
    [cancel, save],
  );

  return (
    <div ref={editorContainerRef} onKeyDown={handleKeyDown}>
      <RichTextEditor
        value={draft}
        onChange={setDraft}
        mentionCandidates={mentionCandidates}
        placeholder={placeholder}
        minHeightClassName="min-h-24"
        uploadPastedImage={uploadPastedImage}
        onBlur={(event) => {
          const relatedTarget = event.relatedTarget;
          if (
            relatedTarget instanceof Node &&
            event.currentTarget.contains(relatedTarget)
          ) {
            return;
          }
          save();
        }}
      />
    </div>
  );
}
