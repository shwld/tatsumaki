import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownPreview } from "./markdown-preview";

describe("MarkdownPreview", () => {
  it("renders headings", () => {
    render(<MarkdownPreview content="# Heading 1" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Heading 1",
    );
  });

  it("renders bold and italic text", () => {
    render(<MarkdownPreview content="**bold** and *italic*" />);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
  });

  it("renders unordered lists", () => {
    render(<MarkdownPreview content={"- item 1\n- item 2"} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("item 1");
  });

  it("renders code blocks", () => {
    render(<MarkdownPreview content={"```\nconst x = 1;\n```"} />);
    expect(screen.getByText("const x = 1;")).toBeInTheDocument();
  });

  it("renders links", () => {
    render(<MarkdownPreview content="[example](https://example.com)" />);
    const link = screen.getByRole("link", { name: "example" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders mention links as non-navigable text", () => {
    render(
      <MarkdownPreview content="[@Member One](mention:github|member-1)" />,
    );
    expect(screen.getByText("@Member One")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "@Member One" })).toBeNull();
  });

  it("sanitizes script tags", () => {
    render(<MarkdownPreview content='<script>alert("xss")</script>' />);
    expect(document.querySelector("script")).toBeNull();
  });

  it("renders GFM task lists", () => {
    const { container } = render(
      <MarkdownPreview content={"- [x] done\n- [ ] todo"} />,
    );
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("applies custom className", () => {
    const { container } = render(
      <MarkdownPreview content="test" className="custom-class" />,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("applies dark mode invert class", () => {
    const { container } = render(<MarkdownPreview content="test" />);
    expect(container.firstChild).toHaveClass("dark:prose-invert");
  });

  it("applies theme variable typography color classes", () => {
    const { container } = render(<MarkdownPreview content="test" />);
    expect(container.firstChild).toHaveClass(
      "prose-headings:text-[var(--color-text)]",
    );
    expect(container.firstChild).toHaveClass(
      "prose-p:text-[var(--color-text)]",
    );
    expect(container.firstChild).toHaveClass(
      "prose-strong:text-[var(--color-text)]",
    );
  });
});
