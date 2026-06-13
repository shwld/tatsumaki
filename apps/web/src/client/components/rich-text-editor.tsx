import { type FocusEventHandler, useEffect, useMemo, useRef } from "react";
import type { ProjectMemberProfile } from "../types/project";
import {
  convertLegacyMentionsToMentionLinks,
  convertMentionLinksToTiptapShortcodes,
  convertTiptapShortcodesToMentionLinks,
} from "../lib/mention-markdown";
import { Image } from "@tiptap/extension-image";
import type { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { Markdown } from "@tiptap/markdown";
import {
  EditorContent,
  type Editor as TiptapEditor,
  useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createAppMentionExtension } from "../lib/tiptap-mention-extension";

type RichTextEditorProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  mentionCandidates?: ProjectMemberProfile[];
  placeholder?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  minHeightClassName?: string;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  /** 画像のペースト / ドロップ時にアップロードし、返した URL を `setImage` する */
  uploadPastedImage?: (file: File) => Promise<string | null>;
};

const RASTER_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

function isRasterImageMimeType(type: string): boolean {
  return RASTER_IMAGE_TYPES.has(type.trim().toLowerCase());
}

function isRasterImageFile(file: File): boolean {
  return isRasterImageMimeType(file.type);
}

function getFirstRasterImageFileFromClipboard(
  event: ClipboardEvent,
): File | null {
  const cd = event.clipboardData;
  if (!cd) {
    return null;
  }
  if (cd.files?.length) {
    for (let i = 0; i < cd.files.length; i++) {
      const f = cd.files.item(i);
      if (f && isRasterImageFile(f)) {
        return f;
      }
    }
  }
  for (const item of cd.items) {
    if (item.kind === "file" && isRasterImageMimeType(item.type)) {
      const f = item.getAsFile();
      if (f && isRasterImageFile(f)) {
        return f;
      }
    }
  }
  return null;
}

function getFirstRasterImageFileFromDataTransfer(
  dt: DataTransfer,
): File | null {
  if (!dt?.files?.length) {
    return null;
  }
  for (let i = 0; i < dt.files.length; i++) {
    const f = dt.files.item(i);
    if (f && isRasterImageFile(f)) {
      return f;
    }
  }
  return null;
}

function containsControlOrLineBreak(url: string): boolean {
  return /[\u0000-\u001F\u007F-\u009F\uFEFF]/.test(url);
}

function isSafeImageSrc(url: string): boolean {
  if (containsControlOrLineBreak(url)) {
    return false;
  }
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2048 || trimmed !== url) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) {
    return false;
  }
  try {
    if (trimmed.startsWith("/")) {
      return trimmed.startsWith("/api/");
    }
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return (
      parsed.origin === window.location.origin &&
      parsed.pathname.startsWith("/api/")
    );
  } catch {
    return false;
  }
}

function ensureRasterImageFileName(file: File): File {
  if (file.name?.trim()) {
    return file;
  }
  const t = file.type.trim().toLowerCase();
  const ext =
    t === "image/png"
      ? "png"
      : t === "image/jpeg" || t === "image/jpg"
        ? "jpg"
        : t === "image/gif"
          ? "gif"
          : t === "image/webp"
            ? "webp"
            : "png";
  return new File([file], `pasted.${ext}`, { type: file.type });
}

function insertUploadedRasterImage(
  editor: Editor | null,
  file: File,
  url: string | null,
): void {
  if (!url || !editor || !isSafeImageSrc(url)) {
    return;
  }
  editor.chain().focus().setImage({ src: url, alt: file.name }).run();
}

type MarkdownEditor = TiptapEditor & {
  getMarkdown?: () => string;
  storage: {
    markdown?: {
      getMarkdown?: () => string;
    };
  };
  commands: TiptapEditor["commands"] & {
    setMarkdown?: (content: string) => boolean;
  };
};

function getMarkdown(editor: TiptapEditor): string {
  const markdownEditor = editor as MarkdownEditor;
  const markdown =
    markdownEditor.getMarkdown?.() ??
    markdownEditor.storage.markdown?.getMarkdown?.() ??
    "";
  return convertTiptapShortcodesToMentionLinks(markdown);
}

function setMarkdown(editor: TiptapEditor, value: string): void {
  const editorValue = convertMentionLinksToTiptapShortcodes(value);
  const markdownEditor = editor as MarkdownEditor;
  if (markdownEditor.commands.setMarkdown) {
    markdownEditor.commands.setMarkdown(editorValue);
    return;
  }
  markdownEditor.commands.setContent(editorValue, { contentType: "markdown" });
}

export function RichTextEditor({
  id,
  value,
  onChange,
  mentionCandidates = [],
  placeholder = "入力してください...",
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid = false,
  disabled = false,
  autoFocus = false,
  minHeightClassName = "min-h-28",
  onBlur,
  uploadPastedImage,
}: RichTextEditorProps) {
  const typographyClassName =
    "prose prose-sm max-w-none prose-headings:text-[var(--color-text)] prose-p:text-[var(--color-text)] prose-strong:text-[var(--color-text)] prose-li:text-[var(--color-text)] prose-code:text-[var(--color-text)] [&_pre_code]:text-slate-100 prose-blockquote:text-[var(--color-text)] prose-a:text-blue-600 dark:prose-invert [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_img]:inline [&_img]:max-h-56 [&_img]:w-auto [&_img]:rounded-md [&_img]:border [&_img]:border-gray-200 [&_img]:object-contain [&_img]:align-text-bottom";

  const editorRef = useRef<TiptapEditor | null>(null);
  const mentionCandidatesRef = useRef(mentionCandidates);
  mentionCandidatesRef.current = mentionCandidates;
  const mentionExtension = useMemo(
    () => createAppMentionExtension(() => mentionCandidatesRef.current),
    [],
  );
  const normalizedValue = useMemo(
    () => convertLegacyMentionsToMentionLinks(value, mentionCandidates),
    [value, mentionCandidates],
  );
  const uploadPastedImageRef = useRef(uploadPastedImage);
  uploadPastedImageRef.current = uploadPastedImage;

  const pasteAndDropProps = useMemo(() => {
    return {
      handlePaste(_view: EditorView, event: ClipboardEvent) {
        const upload = uploadPastedImageRef.current;
        if (!upload) {
          return false;
        }
        let file = getFirstRasterImageFileFromClipboard(event);
        if (!file) {
          return false;
        }
        file = ensureRasterImageFileName(file);
        event.preventDefault();
        event.stopPropagation();
        void upload(file).then((url) => {
          insertUploadedRasterImage(editorRef.current, file, url);
        });
        return true;
      },
      handleDrop(
        _view: EditorView,
        event: DragEvent,
        _slice: unknown,
        moved?: boolean,
      ) {
        if (moved) {
          return false;
        }
        const upload = uploadPastedImageRef.current;
        if (!upload) {
          return false;
        }
        const dt = event.dataTransfer;
        if (!dt) {
          return false;
        }
        let file = getFirstRasterImageFileFromDataTransfer(dt);
        if (!file) {
          return false;
        }
        file = ensureRasterImageFileName(file);
        event.preventDefault();
        event.stopPropagation();
        void upload(file).then((url) => {
          insertUploadedRasterImage(editorRef.current, file, url);
        });
        return true;
      },
    };
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit,
      mentionExtension,
      Image.configure({
        inline: true,
        allowBase64: false,
      }),
      Markdown.configure(),
    ],
    content: convertMentionLinksToTiptapShortcodes(normalizedValue || ""),
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: `${minHeightClassName} ${typographyClassName} rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-500 focus:ring-2`,
        id: id ?? "",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel ?? "Rich text editor",
        "aria-describedby": ariaDescribedBy ?? "",
        "aria-invalid": ariaInvalid ? "true" : "false",
      },
      ...pasteAndDropProps,
    },
    onUpdate: ({ editor: current }) => {
      onChange(getMarkdown(current));
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    if (getMarkdown(editor) === normalizedValue) return;
    setMarkdown(editor, normalizedValue);
  }, [editor, normalizedValue]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div className="space-y-2" onBlur={onBlur}>
      <div
        className={`relative z-0 rounded-md ${
          ariaInvalid ? "border border-red-500 ring-red-500" : ""
        } ${disabled ? "opacity-70" : ""}`}
      >
        <EditorContent editor={editor} />
        {!value.trim() ? (
          <p className="pointer-events-none absolute left-3 top-2 text-sm text-gray-400">
            {placeholder}
          </p>
        ) : null}
      </div>
    </div>
  );
}
