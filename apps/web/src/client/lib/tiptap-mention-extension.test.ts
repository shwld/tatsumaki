import { describe, expect, it, vi } from "vitest";
import { createAppMentionExtension } from "./tiptap-mention-extension";

describe("createAppMentionExtension", () => {
  const candidates = [
    {
      id: "github|member-1",
      displayName: "Member One",
      avatarUrl: null,
      gravatarUrl: null,
    },
    {
      id: "github|shwld",
      displayName: "shwld",
      avatarUrl: null,
      gravatarUrl: null,
    },
  ];

  it("filters mention items by displayName and id", () => {
    const extension = createAppMentionExtension(() => candidates);
    const suggestion = extension.options.suggestion;
    expect(suggestion?.char).toBe("@");

    const items = suggestion?.items?.({ editor: {} as never, query: "shw" });
    expect(items).toEqual([{ id: "github|shwld", label: "shwld" }]);
  });

  it("closes popup renderer on Escape", () => {
    const extension = createAppMentionExtension(() => candidates);
    const suggestion = extension.options.suggestion;
    const renderFactory = suggestion?.render;
    expect(renderFactory).toBeTypeOf("function");

    const renderer = renderFactory?.();
    const command = vi.fn();
    renderer?.onStart?.({
      editor: {} as never,
      range: { from: 0, to: 1 },
      query: "",
      text: "@",
      items: [{ id: "github|member-1", label: "Member One" }],
      command,
      decorationNode: document.createElement("span"),
      clientRect: null,
    });

    expect(screenHasButton("@Member One")).toBe(true);
    const popup = document.body.lastElementChild as HTMLElement | null;
    expect(popup?.style.position).toBe("absolute");
    const consumed = renderer?.onKeyDown?.({
      event: new KeyboardEvent("keydown", { key: "Escape" }),
      view: {} as never,
      range: { from: 0, to: 1 },
    });
    expect(consumed).toBe(true);
    expect(screenHasButton("@Member One")).toBe(false);
  });

  it("reads latest candidates on each query", () => {
    let currentCandidates = [candidates[0]];
    const extension = createAppMentionExtension(() => currentCandidates);
    const suggestion = extension.options.suggestion;

    expect(suggestion?.items?.({ editor: {} as never, query: "" })).toEqual([
      { id: "github|member-1", label: "Member One" },
    ]);

    currentCandidates = candidates;
    expect(suggestion?.items?.({ editor: {} as never, query: "shw" })).toEqual([
      { id: "github|shwld", label: "shwld" },
    ]);
  });
});

function screenHasButton(text: string): boolean {
  return Array.from(document.querySelectorAll("button")).some(
    (button) => button.textContent === text,
  );
}
