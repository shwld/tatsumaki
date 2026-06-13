import { type FormEvent, useEffect, useRef, useState } from "react";

type DeleteAccountDialogProps = {
  isOpen: boolean;
  userEmail: string;
  onCancel: () => void;
};

type DeleteState =
  | { status: "idle" }
  | { status: "deleting" }
  | {
      status: "error";
      message: string;
      soleOwnerProjects?: { id: string; name: string }[];
    };

export function DeleteAccountDialog({
  isOpen,
  userEmail,
  onCancel,
}: DeleteAccountDialogProps) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleteState, setDeleteState] = useState<DeleteState>({
    status: "idle",
  });
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
      cancelButtonRef.current?.focus();
      setConfirmEmail("");
      setDeleteState({ status: "idle" });
    } else if (wasOpenRef.current) {
      previousActiveElementRef.current?.focus();
      previousActiveElementRef.current = null;
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  if (!isOpen) return null;

  const isDeleting = deleteState.status === "deleting";
  const isEmailMatch =
    confirmEmail.trim().toLowerCase() === userEmail.toLowerCase();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isDeleting || !isEmailMatch) return;

    setDeleteState({ status: "deleting" });

    try {
      const response = await fetch("/api/auth/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail }),
      });

      if (response.redirected) {
        window.location.href = response.url;
        return;
      }

      if (response.ok) {
        window.location.href = "/";
        return;
      }

      const data = (await response.json()) as {
        error?: string;
        code?: string;
        projects?: { id: string; name: string }[];
      };
      setDeleteState({
        status: "error",
        message: data.error ?? "アカウントの削除に失敗しました",
        soleOwnerProjects: data.projects,
      });
    } catch {
      setDeleteState({
        status: "error",
        message: "アカウントの削除に失敗しました",
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-4 sm:items-center"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isDeleting) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-description"
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl sm:p-6"
      >
        <h2
          id="delete-account-title"
          className="text-lg font-semibold text-gray-900"
        >
          アカウントを削除しますか？
        </h2>
        <p
          id="delete-account-description"
          className="mt-2 text-sm leading-relaxed text-gray-700"
        >
          この操作は取り消せません。アカウントと個人データが削除されます。過去のコメントや活動履歴上の表示名は記録として残ります。
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="confirm-email"
              className="text-sm font-medium text-gray-700"
            >
              確認のため、メールアドレスを入力してください
            </label>
            <p className="text-xs text-gray-500">{userEmail}</p>
            <input
              id="confirm-email"
              type="email"
              value={confirmEmail}
              onChange={(event) => setConfirmEmail(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder={userEmail}
              disabled={isDeleting}
              autoComplete="off"
            />
          </div>

          {deleteState.status === "error" ? (
            <div className="space-y-1" role="alert">
              <p className="text-sm text-red-600">{deleteState.message}</p>
              {deleteState.soleOwnerProjects &&
              deleteState.soleOwnerProjects.length > 0 ? (
                <ul className="list-disc pl-5 text-sm text-red-600">
                  {deleteState.soleOwnerProjects.map((p) => (
                    <li key={p.id}>{p.name}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
            <button
              ref={cancelButtonRef}
              type="button"
              className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 sm:w-auto"
              onClick={onCancel}
              disabled={isDeleting}
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isDeleting || !isEmailMatch}
              className="w-full rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300 sm:w-auto"
            >
              {isDeleting ? "削除中..." : "アカウントを削除する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
