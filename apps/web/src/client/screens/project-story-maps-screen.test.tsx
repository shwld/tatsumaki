import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthErrorProvider } from "../contexts/auth-error-context";
import { i18n } from "../i18n/config";
import { ProjectStoryMapsScreen } from "./project-story-maps-screen";
import { StoryMapEditScreen } from "./story-map-edit-screen";
import { StoryMapMetaEditScreen } from "./story-map-meta-edit-screen";

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
          <Route
            path="/projects/:projectId/story-maps/:mapId/edit"
            element={<StoryMapMetaEditScreen />}
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

  it("shows only the goal on the detail screen and links to the edit screen", async () => {
    mockFetch(() => [200, { role: "owner", structure: structure() }]);
    renderAt("/projects/p1/story-maps/map-1");
    expect(await screen.findByText("Reach the first story")).toBeTruthy();
    expect(screen.queryByLabelText("タイトル")).toBeNull();
    expect(screen.queryByRole("button", { name: "アーカイブ" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "編集" }).getAttribute("href"),
    ).toBe("/projects/p1/story-maps/map-1/edit");
  });

  it("edits the title through a command and returns to the detail screen", async () => {
    const posts: unknown[] = [];
    mockFetch((_url, init) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return [200, { seq: 1, result: null, duplicate: false }];
      }
      return [200, { role: "owner", structure: structure() }];
    });
    renderAt("/projects/p1/story-maps/map-1/edit");
    const title = (await screen.findByLabelText(
      "タイトル",
    )) as HTMLInputElement;
    expect(title.value).toBe("Onboarding");
    fireEvent.change(title, { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      command: { type: "updateMap", title: "Renamed" },
    });
    expect(
      (posts[0] as { command: Record<string, unknown> }).command,
    ).not.toHaveProperty("achievementGoal");
    expect(await screen.findByRole("link", { name: "編集" })).toBeTruthy();
  });

  it("keeps viewers read-only and hides their edit link", async () => {
    mockFetch(() => [200, { role: "viewer", structure: structure() }]);
    const detail = renderAt("/projects/p1/story-maps/map-1");
    expect(await screen.findByText("閲覧のみできます")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "編集" })).toBeNull();
    detail.unmount();

    renderAt("/projects/p1/story-maps/map-1/edit");
    expect(await screen.findByText("閲覧のみできます")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    expect(screen.queryByRole("button", { name: "アーカイブ" })).toBeNull();
  });

  it("archives from the edit screen", async () => {
    const posts: unknown[] = [];
    mockFetch((_url, init) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return [200, { seq: 1, result: null, duplicate: false }];
      }
      return [200, { role: "owner", structure: structure() }];
    });
    renderAt("/projects/p1/story-maps/map-1/edit");
    fireEvent.click(await screen.findByRole("button", { name: "アーカイブ" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      command: { type: "updateMap", archived: true },
    });
  });

  it("keeps an unsaved title when a failed save reloads the map", async () => {
    let posts = 0;
    mockFetch((_url, init) => {
      if (init?.method === "POST") {
        posts += 1;
        return [500, { error: "boom" }];
      }
      return [200, { role: "owner", structure: structure() }];
    });
    renderAt("/projects/p1/story-maps/map-1/edit");
    const title = (await screen.findByLabelText(
      "タイトル",
    )) as HTMLInputElement;
    fireEvent.change(title, { target: { value: "Draft title" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(posts).toBe(1));
    expect(await screen.findByRole("alert")).toBeTruthy();
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(3),
    );
    expect((screen.getByLabelText("タイトル") as HTMLInputElement).value).toBe(
      "Draft title",
    );
  });

  it("asks to restore an archived map and offers no edit form", async () => {
    mockFetch(() => [
      200,
      {
        role: "owner",
        structure: structure(storyMap({ archivedAt: "2026-01-02 00:00:00" })),
      },
    ]);
    renderAt("/projects/p1/story-maps/map-1/edit");
    expect(
      await screen.findByText(
        "このマップはアーカイブ済みです。復元すると編集できます",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    expect(screen.getByRole("button", { name: "復元" })).toBeTruthy();
  });

  it("renders the live board and sends board edits through the socket", async () => {
    const sent: string[] = [];
    const sockets: FakeSocket[] = [];
    class FakeSocket {
      readyState = 1;
      listeners: Record<string, ((event: unknown) => void)[]> = {};
      constructor() {
        sockets.push(this);
      }
      addEventListener(type: string, fn: (event: unknown) => void) {
        (this.listeners[type] ??= []).push(fn);
      }
      send(data: string) {
        sent.push(data);
      }
      close() {}
      emit(type: string, event: unknown) {
        for (const fn of this.listeners[type] ?? []) fn(event);
      }
    }
    vi.stubGlobal("WebSocket", FakeSocket);
    mockFetch(() => [200, { role: "owner", structure: structure() }]);
    renderAt("/projects/p1/story-maps/map-1");
    await screen.findByText("Reach the first story");
    await waitFor(() => expect(sockets).toHaveLength(1));
    act(() => {
      sockets[0]?.emit("message", {
        data: JSON.stringify({
          type: "snapshot",
          seq: 1,
          role: "owner",
          structure: structure(),
        }),
      });
    });
    expect(await screen.findByText("接続済み · 保存済み")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "活動を追加" }));
    const input = screen.getByRole("textbox", { name: "活動を追加" });
    fireEvent.change(input, { target: { value: "Sign up" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(JSON.parse(sent.at(-1) ?? "{}")).toMatchObject({
      type: "command",
      command: { type: "addActivity", title: "Sign up", afterActivityId: null },
    });
    vi.unstubAllGlobals();
  });
});
