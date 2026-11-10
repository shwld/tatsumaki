import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthErrorProvider } from "../contexts/auth-error-context";
import { i18n } from "../i18n/config";
import { ProjectStoryMapsScreen } from "./project-story-maps-screen";
import { StoryMapEditScreen } from "./story-map-edit-screen";

const storyMap = (overrides: Record<string, unknown> = {}) => ({
  __typename: "StoryMap",
  id: "map-1",
  projectId: "p1",
  title: "Onboarding",
  achievementGoal: "Reach the first story",
  archivedAt: null,
  createdAt: "2026-01-01 00:00:00",
  updatedAt: "2026-01-01 00:00:00",
  ...overrides,
});

const structure = (map = storyMap()) => ({
  map,
  personas: [{ id: "persona-1", name: "Owner", position: 0 }],
  activities: [],
  tasks: [],
  slices: [],
  cards: [],
});

type Handler = (url: string, init?: RequestInit) => [number, unknown];

function mockFetch(handler: Handler) {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const [status, body] = handler(String(input), init);
    return new Response(JSON.stringify(body), { status });
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthErrorProvider>
        <Routes>
          <Route
            path="/projects/:projectId/story-maps"
            element={<ProjectStoryMapsScreen />}
          />
          <Route
            path="/projects/:projectId/story-maps/:mapId"
            element={<StoryMapEditScreen />}
          />
        </Routes>
      </AuthErrorProvider>
    </MemoryRouter>,
  );
}

describe("Story Map screens", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ja");
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists maps with create and archive controls for an editor", async () => {
    mockFetch(() => [200, { storyMaps: [storyMap()], role: "member" }]);
    renderAt("/projects/p1/story-maps");

    expect(
      await screen.findByRole("link", { name: "Onboarding" }),
    ).toBeTruthy();
    expect(screen.getByText("Reach the first story")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Story Map を作成" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "アーカイブ" })).toBeTruthy();
  });

  it("hides create and archive controls from a viewer", async () => {
    mockFetch(() => [200, { storyMaps: [storyMap()], role: "viewer" }]);
    renderAt("/projects/p1/story-maps");

    await screen.findByRole("link", { name: "Onboarding" });
    expect(
      screen.queryByRole("button", { name: "Story Map を作成" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "アーカイブ" })).toBeNull();
  });

  it("shows the empty state and a retryable load failure", async () => {
    mockFetch(() => [200, { storyMaps: [], role: "owner" }]);
    const first = renderAt("/projects/p1/story-maps");
    expect(await screen.findByText("Story Map がありません。")).toBeTruthy();
    first.unmount();

    mockFetch(() => [500, { error: "boom" }]);
    renderAt("/projects/p1/story-maps");
    expect(
      await screen.findByText("Story Map の読み込みに失敗しました"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "再読み込み" })).toBeTruthy();
  });

  it("archives through the map command endpoint and reloads", async () => {
    const calls: { url: string; body: unknown }[] = [];
    mockFetch((url, init) => {
      if (init?.method === "POST") {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return [200, { seq: 1, result: null, duplicate: false }];
      }
      return [200, { storyMaps: [storyMap()], role: "owner" }];
    });
    renderAt("/projects/p1/story-maps");

    fireEvent.click(await screen.findByRole("button", { name: "アーカイブ" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe("/api/projects/p1/story-maps/map-1/commands");
    expect(calls[0]?.body).toMatchObject({
      command: { type: "updateMap", archived: true },
    });
  });

  it("rejects a blank title before creating", async () => {
    mockFetch(() => [200, { storyMaps: [], role: "owner" }]);
    renderAt("/projects/p1/story-maps");
    fireEvent.click(
      await screen.findByRole("button", { name: "Story Map を作成" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "作成" }));
    expect(await screen.findByText("タイトルを入力してください")).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(
      true,
    );
  });

  it("edits the title through a command and keeps viewers read-only", async () => {
    const posts: unknown[] = [];
    mockFetch((_url, init) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return [200, { seq: 1, result: null, duplicate: false }];
      }
      return [200, { role: "owner", structure: structure() }];
    });
    const owner = renderAt("/projects/p1/story-maps/map-1");
    const title = (await screen.findByLabelText(
      "タイトル",
    )) as HTMLInputElement;
    expect(title.value).toBe("Onboarding");
    fireEvent.change(title, { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      command: {
        type: "updateMap",
        title: "Renamed",
        achievementGoal: "Reach the first story",
      },
    });
    owner.unmount();

    mockFetch(() => [200, { role: "viewer", structure: structure() }]);
    renderAt("/projects/p1/story-maps/map-1");
    expect(await screen.findByText("閲覧のみできます")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    expect(screen.queryByLabelText("主要ユーザー名")).toBeNull();
  });

  it("asks to restore an archived map and offers no edit form", async () => {
    mockFetch(() => [
      200,
      {
        role: "owner",
        structure: structure(storyMap({ archivedAt: "2026-01-02 00:00:00" })),
      },
    ]);
    renderAt("/projects/p1/story-maps/map-1");
    expect(
      await screen.findByText(
        "このマップはアーカイブ済みです。復元すると編集できます",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    expect(screen.getByRole("button", { name: "復元" })).toBeTruthy();
  });
});
