import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactPreview } from "./artifact-preview";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function renderPreview() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ArtifactPreview
        projectId="p1"
        artifactId="a1"
        version={2}
        title="Demo"
      />
    </QueryClientProvider>,
  );
}

const tokenResponse = (path: string, expiresAt: string) =>
  json({ token: "SECRET", expiresAt, contentPath: path });

describe("ArtifactPreview", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders only a sandboxed iframe with no extra permissions", async () => {
    vi.mocked(fetch).mockResolvedValue(
      tokenResponse(
        "/artifact-content/abc/index.html",
        new Date(Date.now() + 600_000).toISOString(),
      ),
    );
    renderPreview();

    const frame = await screen.findByTitle("Demo のプレビュー（v2）");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("allow")).toBe("");
    expect(frame.getAttribute("src")).toBe("/artifact-content/abc/index.html");
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "/api/projects/p1/artifacts/a1/versions/2/preview-token",
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
    });
  });

  it("does not listen to messages from the frame", async () => {
    const add = vi.spyOn(window, "addEventListener");
    vi.mocked(fetch).mockResolvedValue(
      tokenResponse(
        "/artifact-content/abc/index.html",
        new Date(Date.now() + 600_000).toISOString(),
      ),
    );
    renderPreview();
    await screen.findByTitle("Demo のプレビュー（v2）");

    expect(add.mock.calls.map(([type]) => type)).not.toContain("message");
  });

  it("unmounts the frame when the token expires and reissues it on reload", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        tokenResponse(
          "/artifact-content/first/index.html",
          new Date(Date.now() + 1_000).toISOString(),
        ),
      )
      .mockResolvedValueOnce(
        tokenResponse(
          "/artifact-content/second/index.html",
          new Date(Date.now() + 600_000).toISOString(),
        ),
      );
    renderPreview();
    await screen.findByTitle("Demo のプレビュー（v2）");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
    });
    expect(screen.queryByTitle("Demo のプレビュー（v2）")).toBeNull();
    expect(
      screen.getByText("プレビューの有効期限が切れました。"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "プレビューを再読み込み" }),
    );
    const frame = await screen.findByTitle("Demo のプレビュー（v2）");
    expect(frame.getAttribute("src")).toBe(
      "/artifact-content/second/index.html",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shows unavailable without a retry when the version cannot be previewed", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: "gone" }, 404));
    renderPreview();

    expect(
      await screen.findByText("この版はプレビューできません。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers a retry on other failures", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: "boom" }, 503));
    renderPreview();

    expect(
      await screen.findByText("プレビューを開始できませんでした。"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "プレビューを再読み込み" }),
    ).toBeInTheDocument();
  });
});

describe("client source", () => {
  const collect = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return collect(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)
        ? [path]
        : [];
    });

  it("never grants the sandbox its own origin", () => {
    const offenders = collect(join(__dirname, "..")).filter((file) =>
      readFileSync(file, "utf8").includes("allow-same-origin"),
    );
    expect(offenders).toEqual([]);
  });
});
