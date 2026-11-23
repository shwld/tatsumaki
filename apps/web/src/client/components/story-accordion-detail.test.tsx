import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ToastProvider } from "../contexts/toast-context";
import { i18n } from "../i18n/config";
import type {
  Story,
  StoryTimelineCommentEntry,
  StoryTimelineEntry,
} from "../types/story";
import { StoryAccordionDetail } from "./story-accordion-detail";

const mockedTimeline: StoryTimelineEntry[] = [];
const mockedRefresh = vi.fn();

const mockViewer = vi.hoisted(() => ({
  id: "github|author",
  displayName: "Author",
  email: "author@example.com",
  avatarUrl: null as string | null,
  gravatarUrl: "",
}));

vi.mock("../hooks/use-current-user", () => ({
  useCurrentUser: () => ({
    user: {
      id: mockViewer.id,
      displayName: mockViewer.displayName,
      email: mockViewer.email,
      avatarUrl: mockViewer.avatarUrl,
      gravatarUrl: mockViewer.gravatarUrl,
    },
    isLoading: false,
  }),
}));

const mockStoryDetail = vi.hoisted(() => ({ story: null as Story | null }));

vi.mock("../hooks/use-story-detail", () => ({
  useStoryDetail: () => ({
    story: mockStoryDetail.story,
    isLoading: false,
    error: null,
  }),
  useStoryTimeline: () => ({
    timeline: mockedTimeline,
    isLoading: false,
    error: null,
    refresh: mockedRefresh,
    loadMore: vi.fn(),
    hasMore: false,
    isLoadingMore: false,
  }),
}));

const mockProjectBootstrapData = vi.hoisted(() => ({
  project: {
    pointScale: [0, 1, 2, 3, 5, 8, 13],
    estimateBugs: true,
    estimateChores: true,
  },
  projectLabels: [] as Array<{
    __typename: "ProjectLabel";
    id: string;
    projectId: string;
    name: string;
    color: string;
    createdAt: string;
    updatedAt: string;
  }>,
  memberOptions: [] as Array<{
    id: string;
    displayName: string;
    avatarUrl: string | null;
    gravatarUrl: string;
  }>,
}));

vi.mock("../hooks/use-project-bootstrap", () => ({
  useProjectBootstrap: () => ({ data: mockProjectBootstrapData }),
}));

function baselineFetchResponse(url: string): Response | null {
  if (url.includes("/attachments")) {
    return new Response(JSON.stringify({ attachments: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (url.match(/\/api\/projects\/[^/]+\/stories(\?.*)?$/)) {
    return new Response(JSON.stringify({ stories: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}

vi.mock("./rich-text-editor", () => ({
  RichTextEditor: ({
    value,
    onChange,
    mentionCandidates = [],
  }: {
    value: string;
    onChange: (value: string) => void;
    mentionCandidates?: Array<{
      id: string;
      displayName: string;
      profileResolved: boolean;
      avatarUrl: string | null;
      gravatarUrl: string | null;
    }>;
  }) => (
    <div>
      <textarea
        role="textbox"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <div data-testid="mention-candidates">
        {mentionCandidates.map((c) => c.id).join(",")}
      </div>
    </div>
  ),
}));

function renderDetail(
  onStoryUpdated?: (story: Story) => void,
  mentionCandidates: Array<{
    id: string;
    displayName: string;
    profileResolved: boolean;
    avatarUrl: string | null;
    gravatarUrl: string | null;
  }> = [],
  story: Story = createStory(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <AuthErrorProvider>
        <ToastProvider>
          <StoryAccordionDetail
            story={story}
            mentionCandidates={mentionCandidates}
            onStoryUpdated={onStoryUpdated}
          />
        </ToastProvider>
      </AuthErrorProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { rerender: () => view.rerender(tree()) };
}

function createStory(): Story {
  return {
    __typename: "Story" as const,
    id: "story-1",
    storyNumber: 1,
    projectId: "project-1",
    title: "Story title",
    description: "description",
    type: "feature" as const,
    status: "Started" as const,
    statusChangedAt: "2026-01-01T00:00:00.000Z",
    storyPoint: 3,
    labels: [],
    iterationId: null,
    isIcebox: false,
    ownerIds: [],
    requesterId: null,
    releaseDate: null,
    position: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("StoryAccordionDetail", () => {
  afterEach(() => {
    void i18n.changeLanguage("ja");
    vi.useRealTimers();
    mockedTimeline.splice(0, mockedTimeline.length);
    mockedRefresh.mockReset();
    vi.unstubAllGlobals();
    mockViewer.id = "github|author";
    mockViewer.displayName = "Author";
    mockViewer.email = "author@example.com";
    mockProjectBootstrapData.projectLabels = [];
    mockStoryDetail.story = null;
  });

  it("shows archived stories read-only and restores them", async () => {
    const story = { ...createStory(), archivedAt: "2026-11-03T00:00:00.000Z" };
    const updated = vi.fn();
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/unarchive"))
        return new Response(
          JSON.stringify({ story: { ...story, archivedAt: null } }),
          { status: 200 },
        );
      return (
        baselineFetchResponse(String(url)) ??
        new Response(null, { status: 404 })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDetail(updated, [], story);
    expect(screen.getByText("アーカイブ済み")).toBeInTheDocument();
    expect(screen.queryByLabelText("タイトル")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "アーカイブ解除" }));
    await waitFor(() =>
      expect(updated).toHaveBeenCalledWith(
        expect.objectContaining({ archivedAt: null }),
      ),
    );
  });

  it("edits and clears the planned date of a release marker", async () => {
    const story: Story = {
      ...createStory(),
      type: "release",
      releaseDate: "2026-12-01",
    };
    const patched: unknown[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          const fields = JSON.parse(String(init.body));
          patched.push(fields);
          return new Response(
            JSON.stringify({ story: { ...story, ...fields } }),
            {
              status: 200,
            },
          );
        }
        return (
          baselineFetchResponse(String(input)) ??
          new Response("{}", { status: 500 })
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    renderDetail(undefined, [], story);

    const dateInput = screen.getByLabelText("リリース予定日");
    expect(dateInput).toHaveValue("2026-12-01");
    fireEvent.change(dateInput, { target: { value: "2027-01-15" } });
    expect(patched).toEqual([]);
    fireEvent.blur(dateInput);
    await waitFor(() =>
      expect(patched).toContainEqual({ releaseDate: "2027-01-15" }),
    );

    fireEvent.change(dateInput, { target: { value: "2027-02-01" } });
    const clear = screen.getByRole("button", { name: "予定日を解除" });
    expect(fireEvent.mouseDown(clear)).toBe(false);
    fireEvent.click(clear);
    await waitFor(() => expect(patched).toContainEqual({ releaseDate: null }));
    expect(patched).not.toContainEqual({ releaseDate: "2027-02-01" });
  });

  it("clears the planned date by keyboard without saving the draft first", async () => {
    const story: Story = {
      ...createStory(),
      type: "release",
      releaseDate: "2026-12-01",
    };
    const patched: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          const fields = JSON.parse(String(init.body));
          patched.push(fields);
          return new Response(
            JSON.stringify({ story: { ...story, ...fields } }),
            { status: 200 },
          );
        }
        return (
          baselineFetchResponse(String(input)) ??
          new Response("{}", { status: 500 })
        );
      }),
    );

    renderDetail(undefined, [], story);

    const dateInput = screen.getByLabelText("リリース予定日");
    const clear = screen.getByRole("button", { name: "予定日を解除" });
    fireEvent.change(dateInput, { target: { value: "2027-02-01" } });
    fireEvent.blur(dateInput, { relatedTarget: clear });
    fireEvent.click(clear);
    await waitFor(() => expect(patched).toEqual([{ releaseDate: null }]));
  });

  it("does not show a planned date field for other story types", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: RequestInfo | URL) =>
          baselineFetchResponse(String(input)) ??
          new Response("{}", { status: 500 }),
      ),
    );
    renderDetail();
    expect(screen.queryByLabelText("リリース予定日")).not.toBeInTheDocument();
  });

  it("shows status select with selectable statuses", () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return baselineFetchResponse(url) ?? new Response("{}", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail();

    const statusSelect = screen.getByLabelText("ステータス");
    expect(statusSelect).toHaveValue("Started");
    expect(screen.getByRole("option", { name: "着手中" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "未着手" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "完了" })).toBeInTheDocument();
    for (const name of ["デリバリー済み", "受け入れ済み", "リジェクト"]) {
      expect(screen.queryByRole("option", { name })).not.toBeInTheDocument();
    }
  });

  it("switches an open accordion detail from Japanese to English", async () => {
    mockedTimeline.push({
      __typename: "StoryTimelineActivityEntry",
      entryType: "activity",
      id: "activity-1",
      storyId: "story-1",
      actorUserId: "github|author",
      actorName: "Author",
      action: "field_changed",
      fieldName: "title",
      oldValue: "Old",
      newValue: "New",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return baselineFetchResponse(url) ?? new Response("{}", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail();

    expect(screen.getByLabelText("ステータス")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "添付ファイル" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "ブロッカー" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "タイムライン" }),
    ).toBeInTheDocument();

    await i18n.changeLanguage("en");

    await waitFor(() => {
      expect(screen.getByLabelText("Status")).toBeInTheDocument();
    });
    expect(screen.getByRole("option", { name: "Started" })).toBeInTheDocument();
    expect(screen.getByText("Select labels")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Description" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Attachments" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Blockers" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Timeline" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Changed Title from Old to New"),
    ).toBeInTheDocument();
  });

  it("shows comment controls when author id matches viewer after trimming whitespace", () => {
    mockedTimeline.push(
      createComment("comment-trim", "sample", "  github|author  "),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        return (
          baselineFetchResponse(url) ?? new Response("{}", { status: 200 })
        );
      }),
    );

    renderDetail();

    expect(screen.getByRole("button", { name: "削除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "編集" })).toBeInTheDocument();
  });

  it("hides comment controls when author id differs even after trimming whitespace", () => {
    mockViewer.id = "github|author";
    mockViewer.email = "author@example.com";
    mockedTimeline.push(
      createComment("comment-other-ws", "sample", "  github|someone-else  "),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        return (
          baselineFetchResponse(url) ?? new Response("{}", { status: 200 })
        );
      }),
    );

    renderDetail();

    expect(
      screen.queryByRole("button", { name: "削除" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "編集" }),
    ).not.toBeInTheDocument();
  });

  it("hides comment edit and delete when the viewer is not the author", () => {
    mockViewer.id = "viewer-other";
    mockViewer.email = "viewer@example.com";
    mockedTimeline.push(
      createComment("comment-other", "sample", "github|author"),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        return (
          baselineFetchResponse(url) ?? new Response("{}", { status: 200 })
        );
      }),
    );

    renderDetail();

    expect(
      screen.queryByRole("button", { name: "削除" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "編集" }),
    ).not.toBeInTheDocument();
  });

  it("deletes a comment from accordion detail", async () => {
    mockedTimeline.push(createComment("comment-1"));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const baseline = baselineFetchResponse(url);
      if (baseline) {
        return baseline;
      }
      return new Response(null, {
        status: 204,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/stories/1/comments/comment-1",
        expect.objectContaining({
          method: "DELETE",
        }),
      );
      expect(mockedRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("shows an error toast when comment delete fails", async () => {
    mockedTimeline.push(createComment("comment-2"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const baseline = baselineFetchResponse(url);
        if (baseline) {
          return baseline;
        }
        return new Response(JSON.stringify({ error: "delete failed" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() => {
      expect(
        screen.getByText("コメントの削除に失敗しました"),
      ).toBeInTheDocument();
    });
  });

  it("passes mention candidates to editor fields", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        return (
          baselineFetchResponse(url) ?? new Response("{}", { status: 500 })
        );
      }),
    );
    renderDetail(undefined, [
      {
        id: "github|member-1",
        displayName: "Member One",
        profileResolved: true,
        avatarUrl: null,
        gravatarUrl: null,
      },
      {
        id: "github|member-2",
        displayName: "Member Two",
        profileResolved: true,
        avatarUrl: null,
        gravatarUrl: null,
      },
    ]);

    const mentions = screen.getAllByTestId("mention-candidates");
    expect(mentions.length).toBeGreaterThan(0);
    for (const element of mentions) {
      expect(element).toHaveTextContent("github|member-1,github|member-2");
    }
  });

  it("renders resolvable mention ids in comment body as display names", () => {
    mockedTimeline.push(
      createComment(
        "comment-mention",
        "hello @github|member-1 and @unknown-id",
      ),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        return (
          baselineFetchResponse(url) ?? new Response("{}", { status: 200 })
        );
      }),
    );

    renderDetail(undefined, [
      {
        id: "github|member-1",
        displayName: "Member One",
        profileResolved: true,
        avatarUrl: null,
        gravatarUrl: null,
      },
    ]);

    const commentItems = screen.getAllByRole("listitem");
    expect(commentItems[0]).toHaveTextContent(
      "hello @Member One and @unknown-id",
    );
  });

  it("escapes markdown characters in resolved display names", () => {
    mockedTimeline.push(
      createComment("comment-escaped", "hello @github|member-1"),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        return (
          baselineFetchResponse(url) ?? new Response("{}", { status: 200 })
        );
      }),
    );

    renderDetail(undefined, [
      {
        id: "github|member-1",
        displayName: "Member_[One]",
        profileResolved: true,
        avatarUrl: null,
        gravatarUrl: null,
      },
    ]);

    const commentItems = screen.getAllByRole("listitem");
    expect(commentItems[0]).toHaveTextContent("@Member_[One]");
  });

  it("does not rewrite emails or inline code mentions", () => {
    mockedTimeline.push(
      createComment(
        "comment-non-target",
        "mail test@example.com and `@github|member-1`",
      ),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        return (
          baselineFetchResponse(url) ?? new Response("{}", { status: 200 })
        );
      }),
    );

    renderDetail(undefined, [
      {
        id: "github|member-1",
        displayName: "Member One",
        profileResolved: true,
        avatarUrl: null,
        gravatarUrl: null,
      },
    ]);

    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("@github|member-1")).toBeInTheDocument();
  });

  it("patches story immediately when label is toggled", async () => {
    mockProjectBootstrapData.projectLabels = [
      {
        __typename: "ProjectLabel",
        id: "label-1",
        projectId: "project-1",
        name: "urgent",
        color: "#ef4444",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const baseline = baselineFetchResponse(url);
      if (baseline) {
        return baseline;
      }
      return new Response(
        JSON.stringify({
          story: { ...createStory(), labels: ["urgent"] },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail();

    const triggerButton = screen.getByText("ラベルを選択");
    fireEvent.click(triggerButton);

    const urgentOption = await screen.findByText("urgent");
    fireEvent.click(urgentOption);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/stories/1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ labelIds: ["label-1"] }),
        }),
      );
    });
  });

  it("shows labels that arrive with the story detail after opening from a summary without labels", () => {
    mockProjectBootstrapData.projectLabels = [
      {
        __typename: "ProjectLabel",
        id: "label-1",
        projectId: "project-1",
        name: "urgent",
        color: "#ef4444",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const { rerender } = renderDetail();
    expect(screen.getByText("ラベルを選択")).toBeTruthy();

    mockStoryDetail.story = {
      ...createStory(),
      labels: [{ id: "label-1", name: "urgent" }],
    };
    rerender();

    expect(screen.queryByText("ラベルを選択")).toBeNull();
    expect(screen.getByText("urgent")).toBeTruthy();
  });

  it("applies labels from a story detail that arrived while a save was pending once the save finishes", async () => {
    mockProjectBootstrapData.projectLabels = [
      {
        __typename: "ProjectLabel",
        id: "label-1",
        projectId: "project-1",
        name: "urgent",
        color: "#ef4444",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    let finishPatch: (response: Response) => void = () => {};
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const baseline = baselineFetchResponse(String(input));
      if (baseline) {
        return Promise.resolve(baseline);
      }
      return new Promise<Response>((resolve) => {
        finishPatch = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderDetail();

    fireEvent.change(screen.getByLabelText("タイトル"), {
      target: { value: "Updated story title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/stories/1",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    mockStoryDetail.story = {
      ...createStory(),
      labels: [{ id: "label-1", name: "urgent" }],
    };
    rerender();
    expect(screen.getByText("ラベルを選択")).toBeTruthy();

    finishPatch(
      new Response(
        JSON.stringify({
          story: {
            ...createStory(),
            title: "Updated story title",
            labels: [{ id: "label-1", name: "urgent" }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    expect(await screen.findByText("urgent")).toBeTruthy();
    expect(screen.queryByText("ラベルを選択")).toBeNull();
  });

  it("patches story status when status select changes", async () => {
    const onStoryUpdated = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const baseline = baselineFetchResponse(url);
      if (baseline) {
        return baseline;
      }
      return new Response(JSON.stringify({ story: createStory() }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail(onStoryUpdated);

    fireEvent.change(screen.getByLabelText("ステータス"), {
      target: { value: "Unstarted" },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/stories/1",
        expect.objectContaining({
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "Unstarted" }),
        }),
      );
    });
    await waitFor(() => {
      expect(onStoryUpdated).toHaveBeenCalled();
      const latest =
        onStoryUpdated.mock.calls[onStoryUpdated.mock.calls.length - 1]?.[0];
      expect(latest).toEqual(expect.objectContaining({ id: "story-1" }));
    });
  });

  it("patches story title when title form is submitted", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const baseline = baselineFetchResponse(url);
      if (baseline) {
        return baseline;
      }
      return new Response(
        JSON.stringify({
          story: { ...createStory(), title: "Updated story title" },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail();

    fireEvent.change(screen.getByLabelText("タイトル"), {
      target: { value: "Updated story title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/stories/1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ title: "Updated story title" }),
        }),
      );
    });
  });

  it("patches story point when point select changes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const baseline = baselineFetchResponse(url);
      if (baseline) {
        return baseline;
      }
      return new Response(
        JSON.stringify({
          story: { ...createStory(), storyPoint: 5 },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail();

    fireEvent.change(screen.getByLabelText("ポイント"), {
      target: { value: "5" },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/stories/1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ storyPoint: 5 }),
        }),
      );
    });
  });

  it("does not show story number row in metadata", () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return baselineFetchResponse(url) ?? new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail();

    expect(screen.queryByText("番号")).not.toBeInTheDocument();
    expect(screen.queryByText("#1")).not.toBeInTheDocument();
  });
});

function createComment(
  id: string,
  body = "sample comment",
  actorUserId = "github|author",
): StoryTimelineCommentEntry {
  return {
    __typename: "StoryTimelineCommentEntry",
    entryType: "comment",
    id,
    storyId: "story-1",
    actorUserId,
    actorName: "author@example.com",
    body,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
