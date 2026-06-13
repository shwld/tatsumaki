import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  projectInvitationAcceptApiPath,
  projectStoriesPath,
} from "../lib/story-routes";
import { parseErrorMessage } from "../lib/parse-error-message";

type AcceptState = "loading" | "success" | "error";

export function ProjectInvitationAcceptScreen() {
  const { projectId, invitationId } = useParams<{
    projectId: string;
    invitationId: string;
  }>();
  const [state, setState] = useState<AcceptState>("loading");
  const [message, setMessage] = useState("招待を処理しています...");

  useEffect(() => {
    if (!projectId || !invitationId) {
      setState("error");
      setMessage("招待情報が不足しています。再招待を依頼してください。");
      return;
    }
    let ignore = false;
    const run = async () => {
      try {
        const response = await fetch(
          projectInvitationAcceptApiPath(projectId, invitationId),
          { method: "POST" },
        );
        if (!response.ok) {
          if (!ignore) {
            setState("error");
            setMessage(await parseErrorMessage(response));
          }
          return;
        }
        if (!ignore) {
          setState("success");
          setMessage("招待を承認しました。プロジェクトに参加しました。");
        }
      } catch {
        if (!ignore) {
          setState("error");
          setMessage("招待の承認に失敗しました。再招待を依頼してください。");
        }
      }
    };
    run();
    return () => {
      ignore = true;
    };
  }, [invitationId, projectId]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-lg font-semibold">プロジェクト招待</h1>
      <p className="mt-3 text-sm text-[var(--color-text)]">{message}</p>
      {state === "success" && projectId ? (
        <Link
          className="mt-4 inline-block text-sm text-blue-700 hover:underline"
          to={projectStoriesPath(projectId)}
        >
          ストーリー一覧へ
        </Link>
      ) : null}
    </main>
  );
}
