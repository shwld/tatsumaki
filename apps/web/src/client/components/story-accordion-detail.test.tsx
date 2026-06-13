import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ToastProvider } from "../contexts/toast-context";
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

vi.mock("../hooks/use-story-detail", () => ({
  useStoryDetail: () => ({
    story: null,
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
    avatarUrl: string | null;
    gravatarUrl: string | null;
  }> = [],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthErrorProvider>
        <ToastProvider>
          <StoryAccordionDetail
            story={createStory()}
            mentionCandidates={mentionCandidates}
            onStoryUpdated={onStoryUpdated}
          />
        </ToastProvider>
      </AuthErrorProvider>
    </QueryClientProvider>,
  );
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
    vi.useRealTimers();
    mockedTimeline.splice(0, mockedTimeline.length);
    mockedRefresh.mockReset();
    vi.unstubAllGlobals();
    mockViewer.id = "github|author";
    mockViewer.displayName = "Author";
    mockViewer.email = "author@example.com";
    mockProjectBootstrapData.projectLabels = [];
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
    expect(
      screen.getByRole("option", { name: "デリバリー済み" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "受け入れ済み" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "リジェクト" }),
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
        avatarUrl: null,
        gravatarUrl: null,
      },
      {
        id: "github|member-2",
        displayName: "Member Two",
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
          body: JSON.stringify({ labels: ["urgent"] }),
        }),
      );
    });
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
