import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { AnchorHTMLAttributes } from "react";

type MarkdownPreviewProps = {
  content: string;
  className?: string;
};

export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  const markdownComponents = {
    a: ({
      href,
      children,
      ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
      if (typeof href === "string" && href.startsWith("mention:")) {
        return (
          <span
            className="font-medium text-[var(--color-text)] no-underline"
            data-mention-href={href}
          >
            {children}
          </span>
        );
      }
      return (
        <a href={href} {...props}>
          {children}
        </a>
      );
    },
  };

  return (
    <div
      className={`prose prose-sm max-w-none prose-headings:text-[var(--color-text)] prose-p:text-[var(--color-text)] prose-strong:text-[var(--color-text)] prose-li:text-[var(--color-text)] prose-code:text-[var(--color-text)] [&_pre_code]:text-slate-100 prose-blockquote:text-[var(--color-text)] prose-a:text-blue-600 dark:prose-invert ${className ?? ""}`}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={markdownComponents}
      >
        {content}
      </Markdown>
    </div>
  );
}
