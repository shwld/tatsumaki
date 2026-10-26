import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../i18n/config";
import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ArtifactDetailScreen } from "./artifact-detail-screen";
import { ArtifactListScreen } from "./artifact-list-screen";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const artifact = {
  id: "art-1",
  projectId: "p1",
  title: "Release report",
  archivedAt: null,
  latestVersion: 2,
  createdBy: "github|1234567890",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};

const versionOf = (version: number, overrides = {}) => ({
  artifactId: "art-1",
  version,
  entrypoint: "index.html",
  treeDigest: "d",
  fileCount: 3,
  totalBytes: 2048,
  createdBy: "github|1234567890",
  createdAt: "2026-01-02T00:00:00.000Z",
  ...overrides,
});

type Routes = Record<string, () => Response>;

function mockApi(routes: Routes) {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    const handler = routes[key];
    if (!handler) return json({ error: `unmocked ${key}` }, 500);
    return handler();
  });
}

const baseRoutes = (): Routes => ({
  "GET /api/projects": () =>
    json({ projects: [{ id: "p1", name: "Demo project" }] }),
  "GET /api/projects/p1/members": () =>
    json({
      members: [
        {
          userId: "github|1234567890",
          displayName: "Alice",
          profileResolved: true,
          avatarUrl: "https://example.test/alice.png",
        },
      ],
    }),
  "GET /api/projects/p1/artifacts/art-1": () =>
    json({ artifact, latestVersion: versionOf(2) }),
  "GET /api/projects/p1/artifacts/art-1/versions": () =>
    json({ versions: [versionOf(2), versionOf(1)] }),
  "POST /api/projects/p1/artifacts/art-1/versions/2/preview-token": () =>
    json({
      token: "T",
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      contentPath: "/artifact-content/two/index.html",
    }),
  "POST /api/projects/p1/artifacts/art-1/versions/1/preview-token": () =>
    json({
      token: "T",
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      contentPath: "/artifact-content/one/index.html",
    }),
});

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthErrorProvider>
        <MemoryRouter initialEntries={[path]}>
          <LocationProbe />
          <Routes>
            <Route
              path="/projects/:projectId/artifacts"
              element={<ArtifactListScreen />}
            />
            <Route
              path="/projects/:projectId/artifacts/:artifactId"
              element={<ArtifactDetailScreen />}
            />
            <Route
              path="/projects/:projectId/artifacts/:artifactId/versions/:version"
              element={<ArtifactDetailScreen />}
            />
          </Routes>
        </MemoryRouter>
      </AuthErrorProvider>
    </QueryClientProvider>,
  );
}

describe("artifact screens", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("list", () => {
    it("lists artifacts with links to their details", async () => {
      mockApi({
        ...baseRoutes(),
        "GET /api/projects/p1/artifacts": () =>
          json({
            artifacts: [
              artifact,
              {
                ...artifact,
                id: "art-2",
                title: "Empty one",
                latestVersion: null,
              },
            ],
          }),
      });
      renderAt("/projects/p1/artifacts");

      const link = await screen.findByRole("link", { name: "Release report" });
      expect(link).toHaveAttribute("href", "/projects/p1/artifacts/art-1");
      expect(screen.getByText(/最新: v2/)).toBeInTheDocument();
      expect(screen.getByText(/版なし/)).toBeInTheDocument();
    });

    it("shows an empty state and an error state", async () => {
      mockApi({
        ...baseRoutes(),
        "GET /api/projects/p1/artifacts": () => json({ artifacts: [] }),
      });
      renderAt("/projects/p1/artifacts");
      expect(
        await screen.findByText(
          "このプロジェクトにはまだ Artifact がありません。",
        ),
      ).toBeInTheDocument();
    });

    it("shows a load error", async () => {
      mockApi({
        ...baseRoutes(),
        "GET /api/projects/p1/artifacts": () => json({ error: "x" }, 500),
      });
      renderAt("/projects/p1/artifacts");
      expect(
        await screen.findByText("Artifacts の読み込みに失敗しました"),
      ).toBeInTheDocument();
    });

    it("renders in English", async () => {
      await i18n.changeLanguage("en");
      mockApi({
        ...baseRoutes(),
        "GET /api/projects/p1/artifacts": () => json({ artifacts: [] }),
      });
      renderAt("/projects/p1/artifacts");
      expect(
        await screen.findByText("This project has no artifacts yet."),
      ).toBeInTheDocument();
    });
  });

  describe("detail", () => {
    it("shows metadata, the creator's name and a sandboxed preview of the latest version", async () => {
      mockApi(baseRoutes());
      renderAt("/projects/p1/artifacts/art-1");

      expect(
        await screen.findByRole("heading", { name: "Release report" }),
      ).toBeInTheDocument();
      const toggle = screen.getByRole("button", { name: "詳細を表示" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("art-1")).toBeNull();
      expect(screen.queryByText("Alice")).toBeNull();
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(await screen.findByText("Alice")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Alice" })).toHaveAttribute(
        "src",
        "https://example.test/alice.png",
      );
      expect(screen.getByText("art-1")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("2.0 KB")).toBeInTheDocument();
      const frame = await screen.findByTitle(/のプレビュー（v2）/);
      expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
      expect(screen.queryByText(/最新版ではありません/)).toBeNull();
    });

    it("follows the detail response when the versions list lags behind it", async () => {
      mockApi({
        ...baseRoutes(),
        "GET /api/projects/p1/artifacts/art-1": () =>
          json({
            artifact: { ...artifact, latestVersion: 3 },
            latestVersion: versionOf(3),
          }),
        "POST /api/projects/p1/artifacts/art-1/versions/3/preview-token": () =>
          json({
            token: "T",
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
            contentPath: "/artifact-content/three/index.html",
          }),
      });
      renderAt("/projects/p1/artifacts/art-1");

      const frame = await screen.findByTitle(/のプレビュー（v3）/);
      expect(frame.getAttribute("src")).toBe(
        "/artifact-content/three/index.html",
      );
      expect(screen.queryByText(/まだ公開された版がありません/)).toBeNull();
      expect(screen.getByLabelText("バージョン")).toHaveValue("3");
    });

    it("shows the unknown-user label when the creator cannot be resolved", async () => {
      mockApi({
        ...baseRoutes(),
        "GET /api/projects/p1/members": () => json({ error: "no" }, 403),
      });
      renderAt("/projects/p1/artifacts/art-1");

      fireEvent.click(
        await screen.findByRole("button", { name: "詳細を表示" }),
      );
      expect(await screen.findByText("不明なユーザー")).toBeInTheDocument();
    });

    it("shows the unknown-user label for a removed member", async () => {
      mockApi({
        ...baseRoutes(),
        "GET /api/projects/p1/members": () => json({ members: [] }),
      });
      renderAt("/projects/p1/artifacts/art-1");

      fireEvent.click(
        await screen.findByRole("button", { name: "詳細を表示" }),
      );
      expect(await screen.findByText("不明なユーザー")).toBeInTheDocument();
    });

    it("navigates to a fixed URL from the version selector", async () => {
      mockApi(baseRoutes());
      renderAt("/projects/p1/artifacts/art-1");
      const select = await screen.findByLabelText("バージョン");

      fireEvent.change(select, { target: { value: "1" } });

      await waitFor(() =>
        expect(screen.getByTestId("location")).toHaveTextContent(
          "/projects/p1/artifacts/art-1/versions/1",
        ),
      );
      const frame = await screen.findByTitle(/のプレビュー（v1）/);
      expect(frame.getAttribute("src")).toBe(
        "/artifact-content/one/index.html",
      );
      expect(screen.getByText(/最新版ではありません/)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /最新版を開く \(v2\)/ }),
      ).toHaveAttribute("href", "/projects/p1/artifacts/art-1");
    });

    it("marks archived artifacts", async () => {
      mockApi({
        ...baseRoutes(),
        "GET /api/projects/p1/artifacts/art-1": () =>
          json({
            artifact: { ...artifact, archivedAt: "2026-01-04T00:00:00.000Z" },
            latestVersion: versionOf(2),
          }),
      });
      renderAt("/projects/p1/artifacts/art-1");
      expect(await screen.findByText("アーカイブ済み")).toBeInTheDocument();
    });

    it("shows not found for an unknown artifact and an unknown version", async () => {
      mockApi({
        ...baseRoutes(),
        "GET /api/projects/p1/artifacts/art-1": () =>
          json({ error: "nf" }, 404),
        "GET /api/projects/p1/artifacts/art-1/versions": () =>
          json({ error: "nf" }, 404),
      });
      renderAt("/projects/p1/artifacts/art-1");
      expect(
        await screen.findByText(/Artifact が見つかりません/),
      ).toBeInTheDocument();
      const detailCalls = vi
        .mocked(fetch)
        .mock.calls.filter(
          ([url]) => String(url) === "/api/projects/p1/artifacts/art-1",
        );
      expect(detailCalls).toHaveLength(1);
    });

    it("shows not found for a version that does not exist", async () => {
      mockApi(baseRoutes());
      renderAt("/projects/p1/artifacts/art-1/versions/9");
      expect(
        await screen.findByText(/Artifact が見つかりません/),
      ).toBeInTheDocument();
      expect(screen.queryByTitle(/プレビュー/)).toBeNull();
    });

    it("explains an artifact without a published version", async () => {
      mockApi({
        ...baseRoutes(),
        "GET /api/projects/p1/artifacts/art-1": () =>
          json({
            artifact: { ...artifact, latestVersion: null },
            latestVersion: null,
          }),
        "GET /api/projects/p1/artifacts/art-1/versions": () =>
          json({ versions: [] }),
      });
      renderAt("/projects/p1/artifacts/art-1");
      expect(
        await screen.findByText(/まだ公開された版がありません/),
      ).toBeInTheDocument();
      expect(screen.queryByTitle(/プレビュー/)).toBeNull();
    });

    it("does not render a preview for a version without an entrypoint", async () => {
      mockApi({
        ...baseRoutes(),
        "GET /api/projects/p1/artifacts/art-1": () =>
          json({ artifact, latestVersion: versionOf(2, { entrypoint: "" }) }),
      });
      renderAt("/projects/p1/artifacts/art-1");
      expect(
        await screen.findByText(/入口ファイルが見つかりません/),
      ).toBeInTheDocument();
      expect(screen.queryByTitle(/プレビュー/)).toBeNull();
    });

    it("shows an error with a retry", async () => {
      mockApi({
        ...baseRoutes(),
        "GET /api/projects/p1/artifacts/art-1": () => json({ error: "x" }, 500),
      });
      renderAt("/projects/p1/artifacts/art-1");
      expect(
        await screen.findByText("Artifact の読み込みに失敗しました"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "再試行" }),
      ).toBeInTheDocument();
    });

    it("offers no create, edit, download or archive controls", async () => {
      mockApi(baseRoutes());
      renderAt("/projects/p1/artifacts/art-1");
      await screen.findByTitle(/のプレビュー（v2）/);

      const names = [
        ...screen.queryAllByRole("button"),
        ...screen.queryAllByRole("link"),
      ].map((element) => element.textContent ?? "");
      expect(names.join(" ")).not.toMatch(
        /download|ダウンロード|upload|アップロード|edit|編集|archive|アーカイブ|delete|削除|作成|create/i,
      );
    });

    it("renders in English", async () => {
      await i18n.changeLanguage("en");
      mockApi(baseRoutes());
      renderAt("/projects/p1/artifacts/art-1");
      expect(await screen.findByLabelText("Version")).toBeInTheDocument();
      expect(
        await screen.findByTitle("Preview of Release report (v2)"),
      ).toBeInTheDocument();
    });
  });
});
