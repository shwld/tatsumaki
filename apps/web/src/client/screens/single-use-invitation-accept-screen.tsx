import { useEffect, useState } from "react";
import { parseErrorMessage } from "../lib/parse-error-message";
import { projectStoriesPath } from "../lib/story-routes";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "success"; projectId: string };

export function SingleUseInvitationAcceptScreen() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", "/invite");
    if (!token) {
      setState({ kind: "error", message: "招待リンクが無効です。" });
      return;
    }

    let ignore = false;
    fetch("/api/invitation-links/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await parseErrorMessage(response));
        return response.json() as Promise<{ projectId: string }>;
      })
      .then(({ projectId }) => {
        if (!ignore) setState({ kind: "success", projectId });
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "招待の受諾に失敗しました。",
          });
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-lg font-semibold">プロジェクト招待</h1>
      <p className="mt-3 text-sm text-[var(--color-text)]">
        {state.kind === "loading"
          ? "招待を処理しています..."
          : state.kind === "success"
            ? "招待を承認しました。プロジェクトに参加しました。"
            : state.message}
      </p>
      {state.kind === "success" ? (
        <a
          className="mt-4 inline-block text-sm text-blue-700 hover:underline"
          href={projectStoriesPath(state.projectId)}
        >
          ストーリー一覧へ
        </a>
      ) : null}
    </main>
  );
}
