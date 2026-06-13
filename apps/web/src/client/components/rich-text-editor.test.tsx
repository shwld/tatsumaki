import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "./rich-text-editor";

describe("RichTextEditor", () => {
  it("renders editor textbox without toolbar buttons", () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />);

    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "B" })).toBeNull();
    expect(screen.queryByRole("button", { name: "I" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Code" })).toBeNull();
    expect(screen.queryByText("メンション候補:")).toBeNull();
  });

  it("shows placeholder for empty value", () => {
    render(
      <RichTextEditor
        value=""
        onChange={vi.fn()}
        placeholder="説明を入力してください"
      />,
    );

    expect(screen.getByText("説明を入力してください")).toBeInTheDocument();
  });

  it("forwards aria and blur handler", () => {
    const onBlur = vi.fn();
    render(
      <RichTextEditor
        value="hello"
        onChange={vi.fn()}
        ariaInvalid
        ariaDescribedBy="desc-error"
        onBlur={onBlur}
      />,
    );

    const textbox = screen.getByRole("textbox");
    expect(textbox).toHaveAttribute("aria-invalid", "true");
    expect(textbox).toHaveAttribute("aria-describedby", "desc-error");

    fireEvent.blur(textbox);
    expect(onBlur).toHaveBeenCalled();
  });

  it("applies typography classes to editor content", () => {
    render(<RichTextEditor value="# title" onChange={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    expect(textbox).toHaveClass("prose");
    expect(textbox).toHaveClass("prose-sm");
    expect(textbox).toHaveClass("max-w-none");
  });

  it("renders markdown image as inline img", async () => {
    render(
      <RichTextEditor
        value="![screenshot](/api/projects/p1/stories/s1/attachments/a1/content)"
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      const img = screen.getByRole("img", { name: "screenshot" });
      expect(img).toHaveAttribute(
        "src",
        "/api/projects/p1/stories/s1/attachments/a1/content",
      );
    });
  });

  it("does not render legacy mention candidate chips", () => {
    render(
      <RichTextEditor
        value=""
        mentionCandidates={[
          {
            id: "github|member-1",
            displayName: "Member One",
            avatarUrl: null,
            gravatarUrl: null,
          },
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("メンション候補:")).toBeNull();
    expect(screen.queryByRole("button", { name: "@Member One" })).toBeNull();
  });

  it("calls uploadPastedImage when pasting an image file", async () => {
    const upload = vi
      .fn()
      .mockResolvedValue("/api/projects/p1/stories/s1/attachments/a1/content");
    render(
      <RichTextEditor value="" onChange={vi.fn()} uploadPastedImage={upload} />,
    );

    const textbox = screen.getByRole("textbox");
    const file = new File([new Uint8Array([137, 80])], "clip.png", {
      type: "image/png",
    });
    // JSDOM は DataTransfer を提供しないため、ハンドラが参照する最小形だけ用意する
    const clipboardData = {
      files: {
        length: 1,
        item: (index: number) => (index === 0 ? file : null),
      },
      items: [] as Iterable<{
        kind: string;
        type: string;
        getAsFile: () => File;
      }>,
      getData: () => "",
    };

    fireEvent.paste(textbox, { clipboardData });

    await waitFor(() => {
      expect(upload).toHaveBeenCalledTimes(1);
      expect(upload.mock.calls[0][0]).toMatchObject({
        name: "clip.png",
        type: "image/png",
      });
    });
  });

  it("does not upload SVG paste payloads", async () => {
    const upload = vi.fn();
    render(
      <RichTextEditor value="" onChange={vi.fn()} uploadPastedImage={upload} />,
    );

    const textbox = screen.getByRole("textbox");
    const file = new File(["<svg />"], "clip.svg", {
      type: "image/svg+xml",
    });
    const clipboardData = {
      files: {
        length: 1,
        item: (index: number) => (index === 0 ? file : null),
      },
      items: [] as Iterable<never>,
      getData: () => "",
    };

    fireEvent.paste(textbox, { clipboardData });

    await waitFor(() => {
      expect(upload).not.toHaveBeenCalled();
    });
  });

  it("ignores upload results that are not same-origin API image URLs", async () => {
    const upload = vi.fn().mockResolvedValue("https://evil.example/x.png");
    render(
      <RichTextEditor value="" onChange={vi.fn()} uploadPastedImage={upload} />,
    );

    const textbox = screen.getByRole("textbox");
    const file = new File([new Uint8Array([137, 80])], "clip.png", {
      type: "image/png",
    });
    const clipboardData = {
      files: {
        length: 1,
        item: (index: number) => (index === 0 ? file : null),
      },
      items: [] as Iterable<never>,
      getData: () => "",
    };

    fireEvent.paste(textbox, { clipboardData });

    await waitFor(() => {
      expect(upload).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
